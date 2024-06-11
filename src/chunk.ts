import { Vec3 } from 'wgpu-matrix';
import { createDensityTexture } from './marchingcubes/density';
import { createMarchingCubesVertices } from './marchingcubes/marchingcubes';
import { numPoints } from './marchingcubes/table';
import { findActiveVoxels } from './marchingcubes/activevoxels';
import { caseTable, vertTable} from './marchingcubes/utils';

export interface Chunk {
    coord: Vec3;
    vertices: GPUBuffer;
}

export async function createChunk(device: GPUDevice, coord: Vec3) {
    let volumeTexture = device.createTexture({
        size: [numPoints, numPoints, numPoints],
        format: "r32float",
        dimension: "3d",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST,
    });
    
    await createDensityTexture(device, volumeTexture, coord);

    

    const markerBuffer: GPUBuffer = device.createBuffer({
        size: (numPoints * numPoints * numPoints) * 15 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    let counters: Uint32Array = new Uint32Array(2);

    await findActiveVoxels(device, volumeTexture, vertTable, counters, markerBuffer);

    if(counters[1] == 0) {
        return null;
    }
   

    let vertices = device.createBuffer({
        // numPoints^3 voxels, max 15 vertices per voxel, vec4(size 16) per vertex
        size: counters[1] * 16, 
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC
    });
      
    await createMarchingCubesVertices(device, volumeTexture, markerBuffer, caseTable, vertices, coord);

    const chunk: Chunk = {coord: coord, vertices: vertices};
    return chunk;
}