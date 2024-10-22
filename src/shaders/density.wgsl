// include constants

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

@group(1) @binding(4)
var nearestRepeat: sampler;

@group(1) @binding(5)
var linearRepeat: sampler;

struct Uniform {
    offset: vec3f,
}

@group(0) @binding(1)
var<uniform> uniforms: Uniform;

// Noise texture constants
const NOISE_LATTICE_SIZE = 16;
const INV_LATTICE_SIZE = 1.0 / NOISE_LATTICE_SIZE;

fn NLQu(uvw: vec3f, tex: texture_3d<f32>) -> vec4f {
    return textureSampleLevel(tex, linearRepeat, uvw, 0f);
}

fn NLQs(uvw: vec3f, tex: texture_3d<f32>) -> vec4f {
    return NLQu(uvw, tex)*2 - vec4f(1.0, 1.0, 1.0, 1.0); 
}

fn NMQu(uvw: vec3f, tex: texture_3d<f32>) -> vec4f {
    let t = fract(uvw * NOISE_LATTICE_SIZE + 0.5);
    let t2 = (3 - 2*t)*t*t;
    let uvw2 = uvw + (t2 - t)/NOISE_LATTICE_SIZE;
    return NLQu(uvw2, tex);
}

fn NMQs(uvw: vec3f, tex: texture_3d<f32>) -> vec4f {
    let t = fract(uvw * NOISE_LATTICE_SIZE + 0.5);
    let t2 = (3 - 2*t)*t*t;
    let uvw2 = uvw + (t2 - t)/NOISE_LATTICE_SIZE;
    return NLQs(uvw2, tex);
}

fn NHQu(uvw: vec3f, tex: texture_3d<f32>, tex_smooth: f32) -> f32 {
    let uvw2 = floor(uvw * NOISE_LATTICE_SIZE) * INV_LATTICE_SIZE;
    var t = (uvw - uvw2) * NOISE_LATTICE_SIZE;
    t = mix(t, t*t*(3-2*t), tex_smooth);

    let d = vec2f(INV_LATTICE_SIZE, 0);

    let f1 = textureSampleLevel(tex, nearestRepeat, uvw2        , 0f).zxyw;
    let f2 = textureSampleLevel(tex, nearestRepeat, uvw2 + d.xyy, 0f).zxyw;
    let f3 = mix(f1, f2, t.xxxx);
    let f4 = mix(f3.xy, f3.zw, t.yy);
    let f5 = mix(f4.x, f4.y, t.z);

    return f5;
}

fn NHQs(uvw: vec3f, tex: texture_3d<f32>, tex_smooth: f32) -> f32 {
    return NHQu(uvw, tex, tex_smooth)*2 - 1;
}

// fn rot(coord: vec3f, matrix: mat4x4<f32>) {
//     return vec3f(dot(matrix[0], coord),   // 3x3 transform,
//                  dot(matrix[1], coord),   // no translation
//                  dot(matrix[2], coord));
// }


@compute
@workgroup_size(8, 8, 4)
fn main(@builtin(global_invocation_id) id : vec3u) {
    var ws = uniforms.offset + vec3f(id);
    var density = -ws.y + 1;

    
    // var uulf_rand  = clamp( NMQu(ws*0.000718, noise0_texture) * 2 - 0.5, vec4f(0, 0, 0, 0), vec4f(1, 1, 1, 1) );
    // var uulf_rand2 =        NMQu(ws*0.000632, noise1_texture);
    // var uulf_rand3 =        NMQu(ws*0.000695, noise2_texture);

    // let prewarp_str = 25f;
    // var ulf_rand = vec3f(0, 0, 0);

    // ulf_rand =     NMQs(ws*0.0041      , noise2_texture).xyz*0.64
    //              + NMQs(ws*0.0041*0.427, noise3_texture).xyz*0.32;
    
    // ws += ulf_rand.xyz * prewarp_str * saturate(uulf_rand3.x*1.4 - 0.3);

    let HFM = 1f;
    density += 
        ( NLQs(ws*0.1600*1.021, noise1_texture).x*0.32*1.16 * HFM // skipped for long-range ambo
            + NLQs(ws*0.0800*0.985, noise2_texture).x*0.64*1.12 * HFM // skipped for long-range ambo
            + NLQs(ws*0.0400*1.051, noise0_texture).x*1.28*1.08 * HFM // skipped for long-range ambo
            + NLQs(ws*0.0200*1.020, noise1_texture).x*2.56*1.04
            + NLQs(ws*0.0100*0.968, noise3_texture).x*5 
            + NMQs(ws*0.0050*0.994,       noise0_texture).x*10*1.0 // MQ
            + NMQs(ws*0.0025*1.045,       noise2_texture).x*20*0.9 // MQ
            // + NHQs(c7*0.0012*0.972, packedNoise3_texture).x*40*0.8 // HQ and *rotated*!
        );

    textureStore(out_texture, id, vec4f(density, 0, 0, 1));
}
