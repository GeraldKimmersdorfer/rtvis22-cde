struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>,
};

struct Uniforms {
	screenSize: vec2<f32>,
	formSize: f32,
    deltaT: f32,
    resolution: vec2<f32>
};

@group(0) @binding(1) var<uniform> uniforms: Uniforms;


/*
   1
 /   \
2     3
|     |
4     5
 \   /
   6
*/
const xoffset = 1.0-sqrt(3.0)/2.0;
const positions = array<vec2<f32>, 6>(
	vec2<f32>(0.0, -1.0),
    vec2<f32>(-1.0 + xoffset, -0.5),
	vec2<f32>(1.0 - xoffset, -0.5),
    vec2<f32>(-1.0 + xoffset, 0.5),
	vec2<f32>(1.0 - xoffset, 0.5),
	vec2<f32>(-0.0, 1.0)
);

fn compute_hash(b: u32) -> u32
{
    var a:u32 = b; a = (a+0x7ed55d16) + (a<<12); a = (a^0xc761c23c) ^ (a>>19); a = (a+0x165667b1) + (a<<5); a = (a+0xd3a2646c) ^ (a<<9);
    a = (a+0xfd7046c5) + (a<<3); a = (a^0xb55a4f09) ^ (a>>16); return a;
}

fn color_from_id_hash(a: u32) -> vec3<f32> 
{
    let hash:u32 = compute_hash(a);
    return vec3<f32>(f32(hash & 255), f32((hash >> 8) & 255), f32((hash >> 16) & 255)) / 255.0;
}

@vertex
fn vs_main(
    @location(0) pos: vec2<f32>,
    @location(1) val: f32,
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> Output {
    //let radius: 0.1F;
    var output: Output;

    let size = uniforms.formSize;
    let pos_transformed:vec2<f32> = vec2<f32>(2.0, 2.0) * pos - vec2<f32>(1.0);
    let size_transformed:f32 = size * 2.0;
    output.Position = vec4<f32>(pos_transformed + positions[vertexIndex] * size_transformed, 0f, 1f);
    //output.vColor = col;
    output.vColor = vec4<f32>(color_from_id_hash(instanceIndex), val);
    //if (instanceIndex == u32(uniforms.resolution.x)-1) {
    //    output.vColor = vec4<f32>(1.0, 0.0, 0.0, 1.0);
    //}
    return output;
}