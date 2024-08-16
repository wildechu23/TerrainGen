@group(0) @binding(0)
var volume_texture: texture_3d<f32>;

@group(0) @binding(1)
var<storage> markers: array<u32>;

@group(0) @binding(2)
var<storage> case_table: array<i32>;

@group(0) @binding(3)
var<storage, read_write> vertices: array<vec4f>;

struct Uniform {
    offset: vec3f,
}

@group(0) @binding(4)
var<uniform> uniforms: Uniform;

@group(0) @binding(5)
var<storage, read_write> counter: array<atomic<u32>>; 

const MC_NUM_ELEMENTS = 256;
const MC_CASE_ELEMENTS = 16;
const isovalue = 0f;

const numPoints = 16;

const INDEX_TO_VERTEX: array<vec3u, 8> = array<vec3u, 8>(
    vec3u(0, 0, 0),
    vec3u(1, 0, 0),
    vec3u(1, 1, 0),
    vec3u(0, 1, 0),
    vec3u(0, 0, 1),
    vec3u(1, 0, 1),
    vec3u(1, 1, 1),
    vec3u(0, 1, 1)
);

const EDGE_VERTICES: array<vec2u, 12> = array<vec2u, 12>(
    vec2u(0, 1),
    vec2u(1, 2),
    vec2u(2, 3),
    vec2u(3, 0),
    vec2u(4, 5),
    vec2u(6, 5),
    vec2u(6, 7),
    vec2u(7, 4),
    vec2u(0, 4),
    vec2u(1, 5),
    vec2u(2, 6),
    vec2u(3, 7)
);

fn lerp_verts(va: vec3u, vb: vec3u, fa: f32, fb: f32) -> vec3f
{
    var t: f32 = 0.0;
    if (abs(fa - fb) >= 0.001) {
        t = (isovalue - fa) / (fb - fa);
    }
    return mix(vec3f(va), vec3f(vb), t);
}


@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) id: vec3u) {

    // if ((id.x >= numPoints - 1 ) || 
    //     (id.y >= numPoints - 1) || 
    //     (id.z >= numPoints - 1)) {
    //     return;
    // }

    // var case_index = 0u;
    // for (var j = 0u; j < 8u; j++) {
    //     if (values[j] <= isovalue) {
    //         case_index |= (1u << j);
    //     }
    // }

    let marker = markers[id.x];
    let case_index =    (marker & 0x000000FF);
    let x =             (marker & 0x0000FF00) >> 8;
    let y =             (marker & 0x00FF0000) >> 16;
    let z =             (marker & 0xFF000000) >> 24;

    let voxel = vec3u(x, y, z);

    var values: array<f32, 8>;
    for (var i = 0; i < 8; i++) {
        let p = voxel + INDEX_TO_VERTEX[i];
        values[i] = textureLoad(volume_texture, p, 0).r;
    }
    
    for (var i = 0u; case_table[case_index * MC_CASE_ELEMENTS + i] != -1; i += 3) {
        let voxel_start = atomicAdd(&counter[0], 3u); // calculate offsets and remove
        for (var j = 0u; j < 3; j++) {
            let edge = case_table[case_index * MC_CASE_ELEMENTS + i + j];
            let edge_v0 = EDGE_VERTICES[edge].x;
            let edge_v1 = EDGE_VERTICES[edge].y;
            
            var v = lerp_verts(INDEX_TO_VERTEX[edge_v0], 
                INDEX_TO_VERTEX[edge_v1], 
                values[edge_v0], 
                values[edge_v1]);
            
            // var v = mix(vec3f(INDEX_TO_VERTEX[edge_v0]), vec3f(INDEX_TO_VERTEX[edge_v1]), 0.5);

            v += vec3f(voxel) + uniforms.offset + 0.5;
            // v /= (numPoints - 1);
            vertices[voxel_start + j] = vec4f(v, 1);
        }
    }
}