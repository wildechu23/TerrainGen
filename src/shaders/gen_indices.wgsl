@group(0) @binding(0)
var vertexIdVol: texture_3d<u32>;

@group(0) @binding(1)
var<storage> markers: array<u32>;

@group(0) @binding(2)
var<storage> case_table: array<i32>;

@group(0) @binding(2)
var<storage> vert_table: array<i32>;

@group(0) @binding(3)
var<storage, read_write> indices: array<vec4f>;

@group(0) @binding(4)
var<storage> indices_offsets: array<vec4f>;

@group(0) @binding(5)
var<storage, read_write> counter: array<atomic<u32>>; 

const MC_NUM_ELEMENTS = 256;
const MC_CASE_ELEMENTS = 16;

const edge_start : array<vec3i, 12> = array<vec3i, 12>(
    vec3i(0, 0, 0),
    vec3i(0, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 0, 0),
    vec3i(0, 0, 1),
    vec3i(0, 1, 1),
    vec3i(1, 0, 1),
    vec3i(0, 0, 1),
    vec3i(0, 0, 0),
    vec3i(0, 1, 0),
    vec3i(1, 1, 0),
    vec3i(1, 0, 0)
);

const edge_dir : array<vec3i, 12> = array<vec3i, 12>(
    vec3i(0, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 0, 1),
    vec3i(0, 0, 1),
    vec3i(0, 0, 1),
    vec3i(0, 0, 1)
);

const edge_end : array<vec3i, 12> = array<vec3i, 12>(
    vec3i(0, 1, 0),
    vec3i(1, 1, 0),
    vec3i(1, 1, 0),
    vec3i(1, 0, 0),
    vec3i(0, 1, 1),
    vec3i(1, 1, 1),
    vec3i(1, 1, 1),
    vec3i(1, 0, 1),
    vec3i(0, 0, 1),
    vec3i(0, 1, 1),
    vec3i(1, 1, 1),
    vec3i(1, 0, 1)
);

const edge_axis : array<i32, 12> = array<i32, 12>(
    1,
    0,
    1,
    0,
    1,
    0,
    1,
    0,
    2,
    2,
    2,
    2
);

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let marker = markers[id.x];
    let cube_case = marker & 0xFF;
    let num_verts = vert_table[cube_case];
    let xyz: vec3<u32> = (vec3<u32>(marker) >> vec3<u32>(8u, 16u, 24u)) & vec3<u32>(0xFFu);

    if (max(max(xyz.x, xyz.y), xyz.z) >= (16-1))
        num_polys = 0;

    
    
    for (let i = 0; i < num_verts; i++) {
        // let edge_nums = vec3i(
        //     case_table[ cube_case * MC_CASE_ELEMENTS + i    ],
        //     case_table[ cube_case * MC_CASE_ELEMENTS + i + 1]
        //     case_table[ cube_case * MC_CASE_ELEMENTS + i + 2]
        // );

        let edge_num = case_table[ cube_case * MC_CASE_ELEMENTS + i];

        let xyz_edge = vec3i(0,0,0);

        xyz_edge = xyz + edge_start[edge_num];
        xyz_edge.x = xyz_edge.x*3 + edge_axis[edge_num];
        let vertex_id = textureLoad(vertexIdVol, vec4i(xyz_edge, 0)).x;


    }


}