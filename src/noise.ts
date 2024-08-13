export let noiseTextures: GPUTexture[] = new Array(4);

export async function initNoise(device: GPUDevice) {
    const promises = [];
    for (let i = 0; i < 4; i++) {
        promises.push(getNoiseTexture(device, i, `noise${i}`));
    }
    await Promise.all(promises);
}

async function getNoiseTexture(device: GPUDevice, index: number, fileName: string) {
    const response = await fetch(`../textures/${fileName}.vol`);
    if (!response.ok) {
        console.log(response.status);
        return;
    }

    const buf = await response.arrayBuffer();
    const texelData = parseTexelData(buf);
    // console.log(texelData);

    const texture = device.createTexture({
        size: [16, 16, 16],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
        {
            texture: texture,
        },
        texelData,
        {
            bytesPerRow: 16 * 4,
            rowsPerImage: 16,
        },
        {
            width: 16,
            height: 16,
            depthOrArrayLayers: 16
        }
    );

    // Store the texture in the array
    noiseTextures[index] = texture;
}

function parseTexelData(buf: ArrayBuffer) {
    const dataStart = 20;
    const numTexels = 16*16*16*4;
    const texelData = new Float32Array(numTexels);

    const dataView = new DataView(buf, dataStart);
    for (let i = 0; i < numTexels; i++) {
        const halfFloat = dataView.getUint16(i * 2, true); // 2 bytes per half-float, little-endian
        texelData[i] = unpackHalfPrecisionFloat(halfFloat);
    }

    return texelData;
}

function unpackHalfPrecisionFloat(half: number) {
    const exponent = (half & 0x7C00) >> 10;
    const fraction = half & 0x03FF;
    return (half & 0x8000 ? -1 : 1) *
           (exponent ? (fraction / 1024 + 1) * Math.pow(2, exponent - 15) : fraction * Math.pow(2, -14));
}