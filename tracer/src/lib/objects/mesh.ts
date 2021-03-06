/* eslint-disable @typescript-eslint/no-use-before-define */
//
// Rayscale - Base raytracing classes
// (C) Ben Coleman 2018
//

import { vec3, vec4 } from 'gl-matrix';
import { ObjModel, Face, Vertex } from 'obj-file-parser';
import { Object3D, ObjectConsts } from './object3d';
import { Ray } from '../ray';
import { Hit } from '../hit';
import { Stats } from '../stats';
import { TResult } from '../t-result';
import { ObjManager } from '../obj-manager';
import { Colour } from '../colour';
import { Animation } from '../animation';

// ====================================================================================================
// Object consisting of a polygon mesh, created from OBJ format file
// ====================================================================================================
export class Mesh extends Object3D {
  // Mesh properties
  public objModel: ObjModel;
  private boundingBox: BoundingBox;
  public boxSettings: BoundingBoxSettings;

  // ====================================================================================================
  // Create a ObjMesh
  // Note. Before calling this constructor the OBJ must be loaded into the ObjManager
  // ====================================================================================================
  constructor(objFile: string, pos: vec3, rot: vec3, scale: number, name: string, bbSettings: BoundingBoxSettings, time: number, anims: Animation[]) {
    super(name, pos, rot, time, anims);

    // Fetch the OBJ model for this mesh from the ObjManager (global singleton)
    // Why the JSON parsing here? This is a hacky way to give me a deep copy of the object
    this.objModel = JSON.parse(JSON.stringify(ObjManager.getInstance().getObjModel(objFile, 0)));
    if(!this.objModel) {
      throw `Obj file ${objFile} not loaded in ObjectManager`;
    }

    // Pre scale mesh, yes this is a bit of a hack and we should be using the matrix transforms
    // Note. This is why we needed a deep clone of the objModel
    // Otherwise we would modify the source data and mess up subsequent renders
    for(const vertPoint of this.objModel.vertices) {
      vertPoint.x *= scale;
      vertPoint.y *= scale;
      vertPoint.z *= scale;
    }

    // Work out outer bounding box dimensions
    const min = vec3.fromValues(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    const max = vec3.fromValues(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);
    for(const vertPoint of this.objModel.vertices) {
      if(vertPoint.x < min[0]) min[0] = vertPoint.x;
      if(vertPoint.y < min[1]) min[1] = vertPoint.y;
      if(vertPoint.z < min[2]) min[2] = vertPoint.z;
      if(vertPoint.x > max[0]) max[0] = vertPoint.x;
      if(vertPoint.y > max[1]) max[1] = vertPoint.y;
      if(vertPoint.z > max[2]) max[2] = vertPoint.z;
    }

    // Default settings for bounding box
    this.boxSettings = bbSettings;
    // Create top level bounding box holding the whole mesh, depth = 0
    this.boundingBox = new BoundingBox(0, vec3.clone(min), vec3.clone(max), this);
  }
  pos: vec3;

  // ====================================================================================================
  // Standard calc T method required by all objects
  // ====================================================================================================
  public calcT(inray: Ray): TResult {
    Stats.objectTests++;
    const ray: Ray = inray.transformNewRay(this.trans);
    const result = new TResult(0.0, ray);

    // Bounding box test, get list of boxes we hit
    const boxResult = Mesh.boundingBoxTest(ray, this.boundingBox);
    if(boxResult.length > 0) {
      // In debug mode we stop when we hit the box and return that result
      if(this.boxSettings.debug) {
        result.t = 5;
        const box = boxResult[boxResult.length-1];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.material.getTexture(0) as any).colour = box.debugColour.copy();
        return result;
      }

      let maxt: number = Number.MAX_VALUE;
      // Loop through all hit boxes, and the faces within them
      for(const box of boxResult) {
        for(const face of box.faces) {
          const v0: vec3 = vec3.fromValues(this.objModel.vertices[face.vertices[0].vertexIndex - 1].x,
            this.objModel.vertices[face.vertices[0].vertexIndex - 1].y,
            this.objModel.vertices[face.vertices[0].vertexIndex - 1].z);
          const v1: vec3 = vec3.fromValues(this.objModel.vertices[face.vertices[1].vertexIndex - 1].x,
            this.objModel.vertices[face.vertices[1].vertexIndex - 1].y,
            this.objModel.vertices[face.vertices[1].vertexIndex - 1].z);
          const v2: vec3 = vec3.fromValues(this.objModel.vertices[face.vertices[2].vertexIndex - 1].x,
            this.objModel.vertices[face.vertices[2].vertexIndex - 1].y,
            this.objModel.vertices[face.vertices[2].vertexIndex - 1].z);

          // Note the weird order of vertices here: swapping v1 and v0 fixed EVERYTHING!
          const faceHit: FaceHit = this.calcFaceHit(ray, v1, v0, v2);

          if(faceHit && faceHit.t < maxt) {
            result.t = faceHit.t + ObjectConsts.EPSILON5;
            maxt = faceHit.t;

            // Store extra face hit data, including which faceIndex in the result flag
            faceHit.face = face;
            result.data = faceHit;
          }
        }
      }
      return result;
    } else {
      // No boxes hit = total miss
      return result;
    }
  }

  // ====================================================================================================
  // Bounding box tests, mindbending recursion into itself and return all hit child boxes
  // ====================================================================================================
  private static boundingBoxTest(ray: Ray, box: BoundingBox): BoundingBox[] {
    let t1, t2, tnear = -Number.MAX_VALUE, tfar = Number.MAX_VALUE, temp;
    let intersectFlag = true;

    // Code stolen from
    // http://ray-tracing-conept.blogspot.com/2015/01/ray-box-intersection-and-normal.html
    for (let i = 0; i < 3; i++) {
      if (ray.dir[i] == 0) {
        if (ray.pos[i] < box.min[i] || ray.pos[i] > box.max[i])
          intersectFlag = false;
      } else {
        t1 = (box.min[i] - ray.pos[i]) / ray.dir[i];
        t2 = (box.max[i] - ray.pos[i]) / ray.dir[i];
        if (t1 > t2) {
          temp = t1;
          t1 = t2;
          t2 = temp;
        }
        if (t1 > tnear)
          tnear = t1;
        if (t2 < tfar)
          tfar = t2;
        if (tnear > tfar)
          intersectFlag = false;
        if (tfar < 0)
          intersectFlag = false;
      }
    }

    // If we've hit this box
    if (intersectFlag) {
      // We need to check any nested child boxes
      if(box.hasChildren()) {

        // Recursion!
        // Test all child boxes and return box hit results together
        // Note. We have to test all possible hit boxes, not just the closest one!
        const tempBoxArray = new Array<BoundingBox>();
        for(const childBox of box.children) {
          const hitBoxesTest = this.boundingBoxTest(ray, childBox);
          if(hitBoxesTest.length > 0) {
            for(const box of hitBoxesTest) {
              tempBoxArray.push(box);
            }
          }
        }
        return tempBoxArray;
      }
      // Hit but no children so return just yourself
      return [box];
    } else {
      // Miss = return no boxes
      return [];
    }

  }

  // ====================================================================================================
  // M??ller???Trumbore intersection algorithm
  // Taken from: https://en.wikipedia.org/wiki/M%C3%B6ller%E2%80%93Trumbore_intersection_algorithm
  // =====================================================================================ray===============
  private calcFaceHit(ray: Ray, vertex0: vec3, vertex1: vec3, vertex2: vec3): FaceHit {
    Stats.meshFaceTests++;
    const edge1: vec3 = vec3.sub(vec3.create(), vertex1, vertex0);
    const edge2: vec3 = vec3.sub(vec3.create(), vertex2, vertex0);
    const h: vec3 = vec3.cross(vec3.create(), [ray.dx, ray.dy, ray.dz], edge2);
    const a: number = vec3.dot(edge1, h);
    if (a > -ObjectConsts.EPSILON4 && a < ObjectConsts.EPSILON4)
      return null;

    const f: number = 1.0 / a;
    const s: vec3 = vec3.sub(vec3.create(), [ray.px, ray.py, ray.pz], vertex0);
    const u: number = f * (vec3.dot(s, h));
    if (u < -ObjectConsts.EPSILON4 || u > 1 + ObjectConsts.EPSILON4)
      return null;
    const q: vec3 = vec3.cross(vec3.create(), s, edge1);
    const v: number = f * (vec3.dot([ray.dx, ray.dy, ray.dz], q));
    if (v < -ObjectConsts.EPSILON4 || u + v > 1 + ObjectConsts.EPSILON4)
      return null;

    const t: number = f * (vec3.dot(edge2, q));
    if (t > ObjectConsts.EPSILON4) {
      return new FaceHit(u, v, t);
    } else {
      return null;
    }
  }

  // ====================================================================================================
  // Standard getHitPoint details required by all Object3D
  // - Important! Input Ray should already be in object space
  // Note. We don't support u, v texture mapping on meshes... yet
  // ====================================================================================================
  public getHitPoint(result: TResult): Hit {
    const i: vec4 = result.ray.getPoint(result.t - ObjectConsts.EPSILON2);

    // Normal is from hit face, we use the flag to hold this
    let n = vec4.fromValues(0.0, 0.0, 0.0, 0);
    if(!this.boxSettings.debug) {
      const face = result.data.face;
      const n0 = vec4.fromValues(this.objModel.vertexNormals[face.vertices[0].vertexNormalIndex - 1].x,
        this.objModel.vertexNormals[face.vertices[0].vertexNormalIndex - 1].y,
        this.objModel.vertexNormals[face.vertices[0].vertexNormalIndex - 1].z, 0);
      const n1 = vec4.fromValues(this.objModel.vertexNormals[face.vertices[1].vertexNormalIndex - 1].x,
        this.objModel.vertexNormals[face.vertices[1].vertexNormalIndex - 1].y,
        this.objModel.vertexNormals[face.vertices[1].vertexNormalIndex - 1].z, 0);
      const n2 = vec4.fromValues(this.objModel.vertexNormals[face.vertices[2].vertexNormalIndex - 1].x,
        this.objModel.vertexNormals[face.vertices[2].vertexNormalIndex - 1].y,
        this.objModel.vertexNormals[face.vertices[2].vertexNormalIndex - 1].z, 0);

      const nx = (1.0 - (result.data.u + result.data.v)) * n1[0] + n0[0] * result.data.u + n2[0] * result.data.v;
      const ny = (1.0 - (result.data.u + result.data.v)) * n1[1] + n0[1] * result.data.u + n2[1] * result.data.v;
      const nz = (1.0 - (result.data.u + result.data.v)) * n1[2] + n0[2] * result.data.u + n2[2] * result.data.v;
      n = vec4.fromValues(nx, ny, nz, 0);
    } else {
      // Debug, just make a normal up
      n = vec4.fromValues(0.33, 0.33, 0.33, 0);
    }

    // move i back to world space
    vec4.transformMat4(i, i, this.transFwd);

    // calc reflected ray about the normal, & move to world
    const r: vec4 = result.ray.reflect(n);
    vec4.transformMat4(r, r, this.transFwd);
    vec4.normalize(r, r);

    // Move normal into world
    vec4.transformMat4(n, n, this.transFwd);
    vec4.normalize(n, n);

    // TODO: Support textures other than basic colour?
    // u & v set to zero/ignored
    const hit: Hit = new Hit(i, n, r, 0, 0);
    return hit;
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Private classes just used for Mesh below here
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

// ====================================================================================================
// Private struct with data we need to add to a TResult in the data field,
// - this holds info about the mesh face that was hit, as well as t, u & v values
// ====================================================================================================
class FaceHit {
  t: number;
  u: number;
  v: number;
  face: Face;

  constructor(u: number, v: number, t: number) {
    this.u = u;
    this.v = v;
    this.t = t;
  }
}

// ====================================================================================================
// Private class for creating an axis aligned bounding box hierarchy around the mesh
// ====================================================================================================
class BoundingBox {
  public min: vec3;
  public max: vec3;
  public faces: Face[];
  public children: BoundingBox[];
  public depth: number;
  private mesh: Mesh;
  public debugColour: Colour;

  // ====================================================================================================
  // Create a bounding box with given mix and max bounds (corners) around given Mesh
  // ====================================================================================================
  constructor(depth: number, min: vec3, max: vec3, mesh: Mesh) {
    this.depth = depth;
    this.min = min;
    this.max = max;
    this.mesh = mesh;
    this.children = new Array<BoundingBox>();
    this.debugColour = new Colour(Math.random(), Math.random(), Math.random());

    //console.log(`### Creating bounding box, depth ${this.depth}: [${min[0]}, ${min[1]}, ${min[2]}] -> [${max[0]}, ${max[1]}, ${max[2]}]`);

    if(depth == 0) {
      // Special case, no need to check for top level box, it always contains ALL faces
      // Just copy array (which should be )
      this.faces = this.mesh.objModel.faces.slice();
    } else {
      this.faces = new Array<Face>();
      for(const face of mesh.objModel.faces) {
        const v0: Vertex = mesh.objModel.vertices[face.vertices[0].vertexIndex - 1];
        const v1: Vertex = mesh.objModel.vertices[face.vertices[1].vertexIndex - 1];
        const v2: Vertex = mesh.objModel.vertices[face.vertices[2].vertexIndex - 1];
        // Check if *ANY* point in face is inside this box, if so add it
        if(this.containsPoint(v0) || this.containsPoint(v1) || this.containsPoint(v2)) {
          this.faces.push(face);
        }
      }
    }
    //console.log(`### Bounding box contains ${this.faces.length} faces`);

    // Recursion!
    // Sub divide this box if contains more faces than our threshold
    // Don't sub-divide too far
    if(this.faces.length > mesh.boxSettings.maxFaces && this.depth < mesh.boxSettings.maxDepth)
      this.subDivide();
  }

  // ====================================================================================================
  // Octree - Sub divide box into eight sub-boxes and store as children
  // ====================================================================================================
  public subDivide(): void {
    // Find center mid point of this box
    const midx = this.min[0] + ((this.max[0] - this.min[0]) / 2);
    const midy = this.min[1] + ((this.max[1] - this.min[1]) / 2);
    const midz = this.min[2] + ((this.max[2] - this.min[2]) / 2);

    // This gibberish is creating 8 more boxes, I don't really understand it
    const bb1b = new BoundingBox(this.depth + 1, vec3.fromValues(this.min[0], this.min[1], this.min[2]), vec3.fromValues(midx, midy, midz), this.mesh);
    const bb2b = new BoundingBox(this.depth + 1, vec3.fromValues(this.min[0], midy, this.min[2]), vec3.fromValues(midx, this.max[1], midz), this.mesh);
    const bb3b = new BoundingBox(this.depth + 1, vec3.fromValues(midx, this.min[1], this.min[2]), vec3.fromValues(this.max[0], midy, midz), this.mesh);
    const bb4b = new BoundingBox(this.depth + 1, vec3.fromValues(midx, midy, this.min[2]), vec3.fromValues(this.max[0], this.max[1], midz), this.mesh);
    const bb1f = new BoundingBox(this.depth + 1, vec3.fromValues(this.min[0], this.min[1], midz), vec3.fromValues(midx, midy, this.max[2]), this.mesh);
    const bb2f = new BoundingBox(this.depth + 1, vec3.fromValues(this.min[0], midy, midz), vec3.fromValues(midx, this.max[1], this.max[2]), this.mesh);
    const bb3f = new BoundingBox(this.depth + 1, vec3.fromValues(midx, this.min[1], midz), vec3.fromValues(this.max[0], midy, this.max[2]), this.mesh);
    const bb4f = new BoundingBox(this.depth + 1, vec3.fromValues(midx, midy, midz), vec3.fromValues(this.max[0], this.max[1], this.max[2]), this.mesh);

    // Add sub boxes to children list,
    // Important to only add boxes that actually contain faces
    if(bb1b.hasFaces()) this.children.push(bb1b);
    if(bb2b.hasFaces()) this.children.push(bb2b);
    if(bb3b.hasFaces()) this.children.push(bb3b);
    if(bb4b.hasFaces()) this.children.push(bb4b);
    if(bb1f.hasFaces()) this.children.push(bb1f);
    if(bb2f.hasFaces()) this.children.push(bb2f);
    if(bb3f.hasFaces()) this.children.push(bb3f);
    if(bb4f.hasFaces()) this.children.push(bb4f);
  }

  // ====================================================================================================
  // Check if a mesh vertex is contained inside this box
  // ====================================================================================================
  public containsPoint(vertex: Vertex): boolean {
    if(vertex.x > this.min[0] - this.mesh.boxSettings.vertexEpsilon && vertex.x < this.max[0] + this.mesh.boxSettings.vertexEpsilon &&
       vertex.y > this.min[1] - this.mesh.boxSettings.vertexEpsilon && vertex.y < this.max[1] + this.mesh.boxSettings.vertexEpsilon &&
       vertex.z > this.min[2] - this.mesh.boxSettings.vertexEpsilon && vertex.z < this.max[2] + this.mesh.boxSettings.vertexEpsilon) {
      return true;
    }
    return false;
  }

  // ====================================================================================================
  // Has this box any children?
  // ====================================================================================================
  public hasChildren(): boolean {
    return this.children.length > 0;
  }

  // ====================================================================================================
  // Does this this box contain any faces
  // ====================================================================================================
  public hasFaces(): boolean {
    return this.faces.length > 0;
  }
}

// ====================================================================================================
// Exported class for setting bounding box parameters
// ====================================================================================================
export class BoundingBoxSettings {
  public maxFaces: number;
  public maxDepth: number;
  public vertexEpsilon: number;
  public debug: boolean;

  constructor(maxFaces: number, maxDepth: number, vertexEpsilon: number) {
    this.maxFaces = maxFaces;
    this.maxDepth = maxDepth;
    this.vertexEpsilon = vertexEpsilon;
    this.debug = false;
  }
}