struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>,
};

struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, unknown
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid
    
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>               // color for min values
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> minmaxvalues: vec4<f32>;


/*
   1
 /   \
2     3
|     |
4     5
 \   /
   6
*/
const xoffset = 1.0 - sqrt(3.0) / 2.0;
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

fn color_from_val(val: f32) -> vec4<f32>
{
    if (uniforms.colorMode == 0) {   // sequential
        let p:f32 = (val - minmaxvalues.r) / minmaxvalues.b;
        return mix(uniforms.colorC, uniforms.colorA, p);
    } else {    // diverging
        if (val < 0) {
            let p:f32 = abs(val) / abs(minmaxvalues.r);
            return mix(uniforms.colorB, uniforms.colorC, p);
        } else {
            let p:f32 = val / minmaxvalues.g;
            return mix(uniforms.colorB, uniforms.colorA, p);
        }
    }
    
    
}

@vertex
fn vs_main(
    @location(0) gridVal: vec4<f32>,
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> Output {
    var output: Output;
    let scale = 2.0;
    let offset = vec2<f32>(1.0, 1.0);
    let pos_transformed:vec2<f32> = vec2<f32>(scale, scale) * gridVal.xy - offset;
    let size_transformed:f32 = uniforms.gridProperties.x * scale * 0.9;
    output.Position = vec4<f32>(pos_transformed + positions[vertexIndex] * size_transformed, 0f, 1f);

    let data_availabe:bool = gridVal.a > 0.0;
    if (data_availabe) {
        output.vColor = color_from_val(gridVal.b);
    } else {
        output.vColor = vec4<f32>(vec3<f32>(1.0, 1.0, 1.0), 0.05);
    }
    
    return output;
}