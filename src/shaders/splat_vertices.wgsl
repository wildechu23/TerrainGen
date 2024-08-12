// need 3d texture, VertexIDVol
@group(0) @binding(0)
var vertexIdVol: texture_storage_3d<r32uint, write>;

@group(0) @binding(1)
var<storage> markers: array<u32>;

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let marker = markers[id.x];
    let edgeNum = marker & 0x0F;
    let xyz: vec3<u32> = (vec3<u32>(marker) >> vec3<u32>(8u, 16u, 24u)) & vec3<u32>(0xFFu);

    xyz.x *= 3;
    if(edgeNum == 3)
        xyz.x += 0;
    elseif(edgeNum == 0)
        xyz.x += 1;
    elseif(edgeNum ==8)
        xyz.x += 2;
    
    vec2f uv = vec2f(xyz.xy);
    uv.x += 0.5 * (1.0/16.0) / 3.0;
    uv.y += 0.5 * (1.0/16.0);

    let projCoord = vec4f(
        (uv.x * (1.0/16.0) / 3.0)*2 - 1, 
        ((uv.y * (1.0/16.0)      )*2 - 1) * -1,
        xyz.z,
        1,
    );
    
    textureStore(vertexIdVol, projCoord, id.x);
}