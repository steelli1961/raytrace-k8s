//
// Shared definition in both Tracer and Controller
//

export class Task {
  
  id: string;             // GUID
  index: number;          // Offset of task in current job, used when re-assembling 
  imageWidth: number;     // Width of whole job image, in pixels
  imageHeight: number;    // Height of whole job image, in pixels
  maxDepth: number;       // Maximum recursion depth when ray tracing, default is 4
  skip: number;           // Row increment to speed up rendering but skip rows - NOT USED
  antiAlias: boolean;     // Enable anti-aliasing
  
  // Slice is the horizontal sub-region across the image, the task will render
  sliceStart: number;     // Slice offset start from top of image in pixels
  sliceHeight: number;    // Height of slice to be rendered
}