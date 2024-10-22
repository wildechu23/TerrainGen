
// include constants & ray_dirs

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

@group(0) @binding(6)
var linearClamp: sampler;

@group(0) @binding(6)
var nearestClamp: sampler;


const AMBO_RAYS = 32;
const AMBO_STEPS = 16;
const MC_NUM_ELEMENTS = 256;
const MC_CASE_ELEMENTS = 16;
const isovalue = 0f;



fn lerp_verts(va: vec3u, vb: vec3u, fa: f32, fb: f32) -> vec3f
{
    var t: f32 = 0f;
    if (abs(fa - fb) >= 0.001) {
        t = clamp((isovalue - fa) / (fb - fa), 0, 1);
    }
    return mix(vec3f(va), vec3f(vb), t);
}

struct Vertex {
    coordAmbo: vec4f,
    worldNormal: vec3f,
}

fn place_vert_on_edge(ws_ll: vec3f, uvw_ll: vec3f, edge_num: i32) -> Vertex {
    var INDEX_TO_VERTEX: array<vec3u, 8> = array<vec3u, 8>(
        vec3u(0, 0, 0),
        vec3u(1, 0, 0),
        vec3u(1, 1, 0),
        vec3u(0, 1, 0),
        vec3u(0, 0, 1),
        vec3u(1, 0, 1),
        vec3u(1, 1, 1),
        vec3u(0, 1, 1)
    );

    var EDGE_VERTICES: array<vec2u, 12> = array<vec2u, 12>(
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

    var output: Vertex;
    
    let edge_v0 = EDGE_VERTICES[edge_num].x;
    let edge_v1 = EDGE_VERTICES[edge_num].y;


    var str0 = textureLoad(volume_texture, vec3u(uvw_ll + vec3f(INDEX_TO_VERTEX[edge_v0])), 0).x;
    var str1 = textureLoad(volume_texture, vec3u(uvw_ll + vec3f(INDEX_TO_VERTEX[edge_v1])), 0).x;
    
    var v = lerp_verts(INDEX_TO_VERTEX[edge_v0], 
        INDEX_TO_VERTEX[edge_v1], 
        str0, 
        str1
    );

    var wsCoord = ws_ll + v;
    var uvw = uvw_ll + v;
    // var wsCoord = ws_ll + v * vec3f(wsVoxelSize);
    // var uvw = uvw_ll + v * vec3f(invVoxelDimPlusMarginsMinusOne);

    output.coordAmbo = vec4f(wsCoord, 0);
    
    // Generate ambient occlusion
    var ambo: f32;
    const cells_to_skip = 1.25f;
    const ambo_ray_dist_cells = /*voxelDimPlusMargins * */0.25 * voxelDim;
    // const invVoxelDimTweaked = vec3f(invVoxelDimPlusMargins) * voxelDimPlusMargins / 160f;

    for(var i = 0; i < AMBO_RAYS; i++) {
        // ray_dir is a unit vector
        var ray_dir = ray_dirs[i].xyz;
        var ray_start = uvw;
        var ray_now = ray_start + ray_dir * /*vec3f(invVoxelDimPlusMargins) * */cells_to_skip;
        var ray_delta = ray_dir * /*invVoxelDimTweaked * */vec3f(ambo_ray_dist_cells);

        var ambo_this = 1f;

        ray_delta *= (1.0 / AMBO_STEPS);

        // Short range sampling
        for(var j = 0; j < AMBO_STEPS; j++) {
            ray_now += ray_delta;
            var t = textureSampleLevel(volume_texture, linearClamp, ray_now, 0f).x;

            // occlusion_amt inversely scales with distance (see constants.ts for formula)
            ambo_this = mix(ambo_this, 0f, clamp(t*6, 0, 1) * occlusion_amt[j].z);
        }

        // // Long range sampling
        // for(var j = 0; j < 5; j++) {
        //     var distance = (j + 2) / 5.0;
        //     distance = pow(distance, 1.8);
        //     distance *= 40;
        //     // var t = DENSITY(ws + ray_dir * distance);
        //     // var shadow_hardness = 0.5;
        //     // ambo_this *= 0.1 + 0.9 * clamp(-t * shadow_hardness + 0.3, 0, 1);
        // }

        ambo_this *= 1.4;
        ambo += ambo_this;
    }

    ambo *= (1.0 / AMBO_RAYS);
    output.coordAmbo.w = ambo;

    // Calculate normal
    var grad: vec3f;
    grad.x = textureSampleLevel(volume_texture, linearClamp, uvw + vec3f(invVoxelDimPlusMargins, 0, 0), 0f).x
            - textureSampleLevel(volume_texture, linearClamp, uvw - vec3f(invVoxelDimPlusMargins, 0, 0), 0f).x;
    grad.y = textureSampleLevel(volume_texture, linearClamp, uvw + vec3f(0, invVoxelDimPlusMargins, 0), 0f).x
            - textureSampleLevel(volume_texture, linearClamp, uvw - vec3f(0, invVoxelDimPlusMargins, 0), 0f).x;
    grad.z = textureSampleLevel(volume_texture, linearClamp, uvw + vec3f(0, 0, invVoxelDimPlusMargins), 0f).x
            - textureSampleLevel(volume_texture, linearClamp, uvw - vec3f(0, 0, invVoxelDimPlusMargins), 0f).x;
    output.worldNormal = -normalize(grad);
    
    return output;
}


@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let marker = markers[id.x];
    let case_index =    (marker & 0x000000FF);

    var unpacked_coord = vec3u();
    unpacked_coord.x =  (marker & 0x0000FF00) >> 8;
    unpacked_coord.y =  (marker & 0x00FF0000) >> 16;
    unpacked_coord.z =  (marker & 0xFF000000) >> 24;

    let chunk_coord_write = vec3f(unpacked_coord) /* * vec3f(invVoxelDimMinusOne)*/;
    // let chunk_coord_read = (vec3f(margin) + vec3f(voxelDimMinusOne) * chunk_coord_write) * vec3f(invVoxelDimPlusMarginsMinusOne);
    let chunk_coord_read = chunk_coord_write;

    let ws = uniforms.offset + chunk_coord_write /* * wsChunkSize*/;

    var uvw = chunk_coord_read /*+ vec3f(invVoxelDimPlusMarginsMinusOne)*0.25*/;
    // HACK #2
    // uvw *= f32(voxelDimPlusMargins-1)*f32(invVoxelDimPlusMargins);

    // let voxel = ws;

    // var values: array<f32, 8>;
    // for (var i = 0; i < 8; i++) {
    //     // let p = voxel + INDEX_TO_VERTEX[i];
    //     // values[i] = textureLoad(volume_texture, p, 0).r;
    // }
    
    for (var i = 0u; case_table[case_index * u32(MC_CASE_ELEMENTS) + i] != -1; i += 3u) {
        let voxel_start = atomicAdd(&counter[0], 3u); // calculate offsets and remove
        for (var j = 0u; j < 3; j++) {
            let edge = case_table[case_index * u32(MC_CASE_ELEMENTS) + i + j];
            
            var v: Vertex = place_vert_on_edge(ws, uvw, edge);
            vertices[voxel_start + j] = vec4f(v.coordAmbo);
        }
    }
}