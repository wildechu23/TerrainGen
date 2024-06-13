import { MC_CASE_TABLE, MC_VERTICES_TABLE } from './table' 

export let caseTable: GPUBuffer;
export let vertTable: GPUBuffer;

// MUST BE CALLED BEFORE VARIABLES CAN BE USED
export function initUtils(device: GPUDevice) {
    caseTable = device.createBuffer({
        size: MC_CASE_TABLE.byteLength,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
    });

    new Int32Array(caseTable.getMappedRange()).set(MC_CASE_TABLE);
    caseTable.unmap();
    
    
    vertTable = device.createBuffer({
        size: MC_VERTICES_TABLE.byteLength,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
    });

    new Int32Array(vertTable.getMappedRange()).set(MC_VERTICES_TABLE);
    vertTable.unmap();

    // Prevent modifications just in case i'm really stupid
    Object.freeze(caseTable);
    Object.freeze(vertTable);
}