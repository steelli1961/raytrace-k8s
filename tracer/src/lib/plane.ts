//
// Rayscale - Base raytracing classes
// (C) Ben Coleman 2018
//

import { Object3D, ObjectConsts } from './object3d';
import { Ray } from './ray';
import { vec3, vec4, mat4, quat } from 'gl-matrix';
import { Hit } from './hit';
import { Material } from './material';
import { Animation } from './animation';
import { Utils } from './utils';
import { Stats } from './stats';
import { TResult } from './t-result';

// ====================================================================================================
// Object representing a plane infinite plane
// - Centred at `pos`, and pointing upwards (+ve Y axis), like a "floor"
// ====================================================================================================
export class Plane implements Object3D {
  // Base properties
  name: string;
  pos: vec3;
  trans: mat4;
  transFwd: mat4;
  material: Material;
  animations: Animation[];

  // Plane properties
  norm: vec4;

  // ====================================================================================================
  // Create a Plane (called by Scene parser)
  // ====================================================================================================
  constructor(pos: vec3, rotation: vec3, name: string) {
    this.name = name;
    this.pos = pos;

    // pointing up
    this.norm = vec4.fromValues(0, 1, 0, 0);

    this.transFwd = mat4.identity(mat4.create());
    this.trans = mat4.identity(mat4.create());
    const rot: quat = quat.identity(quat.create());
    quat.rotateX(rot, rot, Utils.degreeToRad(rotation[0]));
    quat.rotateY(rot, rot, Utils.degreeToRad(rotation[1]));
    quat.rotateZ(rot, rot, Utils.degreeToRad(rotation[2]));
    mat4.fromRotationTranslationScale(this.transFwd, rot, [pos[0], pos[1], pos[2]], [1, 1, 1]);
    mat4.invert(this.trans, this.transFwd);
  }

  public calcT(inray: Ray): TResult {
    Stats.objectTests++;
    const ray: Ray = inray.transformNewRay(this.trans);

    const denom: number = vec4.dot(this.norm, ray.dir);
    if (Math.abs(denom) > ObjectConsts.EPSILON3) {
      const l0: vec4 = vec4.sub(vec4.create(), [0, 0, 0, 1], ray.pos);
      const t: number = vec4.dot(l0, this.norm) / denom;
      if (t >= 0)  {
        return new TResult(t, ray);
      }
    }
    return new TResult(0.0, ray);
  }

  public getHitPoint(result: TResult): Hit {
    const i: vec4 = result.ray.getPoint(result.t - ObjectConsts.EPSILON4);

    const texture = this.material.getTexture();

    let u = Math.abs((i[0] % texture.scaleU) / texture.scaleU);
    if(i[0] < 0) u = 1 - u;
    let v = Math.abs((i[2] % texture.scaleV) / texture.scaleV);
    if(i[2] < 0) v = 1 - v;

    // move i back to world space
    vec4.transformMat4(i, i, this.transFwd);

    // calc reflected ray about the normal, & move to world
    const r: vec4 = result.ray.reflect(this.norm);
    vec4.transformMat4(r, r, this.transFwd);
    vec4.normalize(r, r);

    // Move normal into world
    const n: vec4 = vec4.create();
    vec4.transformMat4(n, this.norm, this.transFwd);
    vec4.normalize(n, this.norm);

    const hit: Hit = new Hit(i, this.norm, r, u, v);
    return hit;
  }
}