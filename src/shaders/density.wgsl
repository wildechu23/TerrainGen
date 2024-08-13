@group(0) @binding(0)
var out_texture: texture_storage_3d<r32float, write>;

@group(1) @binding(0)
var noise0_texture: texture_3d<f32>;

@group(1) @binding(1)
var noise1_texture: texture_3d<f32>;

@group(1) @binding(2)
var noise2_texture: texture_3d<f32>;

@group(1) @binding(3)
var noise3_texture: texture_3d<f32>;

struct Uniform {
    offset: vec3f,
}

@group(0) @binding(1)
var<uniform> uniforms: Uniform;

fn pcg(n: u32) -> u32 {
    var h = n * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    return (h >> 22u) ^ h;
}

const numPoints = 16;

@compute
@workgroup_size(8, 8, 4)
fn main(@builtin(global_invocation_id) id : vec3u) {
    let pos = uniforms.offset * (numPoints - 1) + vec3f(id);

    // let planet_rad = 30.0;
    // let center = vec3f(30, 30, 30);
    // let dist = planet_rad - length(center - pos);

    // let density = dist;
    var density = -f32(pos.y);

    density += textureLoad(noise0_texture, vec3i(vec3f(id)*4.03 % 16), 0).x * 0.25;
    density += textureLoad(noise1_texture, vec3i(vec3f(id)*1.96 % 16), 0).x * 0.5;
    density += textureLoad(noise2_texture, vec3i(vec3f(id)*1.01 % 15), 0).x * 1;

    textureStore(out_texture, id, vec4f(density, 0, 0, 1));
}
