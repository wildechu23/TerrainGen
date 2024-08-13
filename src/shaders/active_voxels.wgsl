@group(0) @binding(0)
var volume_texture: texture_3d<f32>;

@group(0) @binding(1)
var<storage> vert_table: array<i32>;

@group(0) @binding(2)
var<storage, read_write> counters: array<atomic<u32>>;

@group(0) @binding(3)
var<storage, read_write> markers: array<u32>;

const numPoints = 16;

const isovalue = 0f;
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

@compute @workgroup_size(8, 8, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if ((id.x >= numPoints - 1 ) || 
        (id.y >= numPoints - 1) || 
        (id.z >= numPoints - 1)) {
        return;
    }

    let voxel = id;

    var values: array<f32, 8>;
    for (var i = 0; i < 8; i++) {
        let p = voxel + INDEX_TO_VERTEX[i];
        values[i] = textureLoad(volume_texture, p, 0).r;
    }

    var case_index = 0u;
    for (var j = 0u; j < 8u; j++) {
        if (values[j] <= isovalue) {
            case_index |= (1u << j);
        }
    }

    if(case_index * (255 - case_index) > 0) {
        let num_verts = vert_table[case_index];
        let index = atomicAdd(&counters[0], 1u);

        let z8_y8_x8_case8 = (id.z << 24) | (id.y << 16) | (id.x << 8) | case_index;
        markers[index] = z8_y8_x8_case8;
        atomicAdd(&counters[1], u32(num_verts));
    }

}
