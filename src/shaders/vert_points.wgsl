struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>,
};


@group(0) @binding(1) var<storage, read> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read> minmaxvalues: vec4<f32>;


@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> Output {

    return output;
}
