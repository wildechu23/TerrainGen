struct VertexInput {
    @location(0) position: vec4f,
};

struct VertexOutput {
    // This is the equivalent of gl_Position in GLSL
    @builtin(position) position: vec4f,
    @location(0) world_pos: vec3f,
    @location(1) coord_ambo: vec4f,
};

struct ViewParams {
    proj_view: mat4x4<f32>,
    volume_dims: vec4u,
};

@group(0) @binding(0)
var<uniform> params: ViewParams;

@vertex
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    var pos = vert.position.xyz - vec3f(params.volume_dims.xyz) / 2.0;
    out.position = params.proj_view * vec4f(pos, 1.0);
    // out.position = vert.position;
    out.world_pos = pos;
    out.coord_ambo = vert.position;
    return out;
};

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4f {
    // var ambo = clamp(in.coord_ambo.w * 2.1 - 0.1, 0, 1);
    var ambo = in.coord_ambo.w;
    
    let dx = dpdx(in.world_pos);
    let dy = dpdy(in.world_pos);
    let n = normalize(cross(dx, dy));
    return vec4f((ambo + 0.1) * 0.5 * (n + 1.0), 1.0);
}