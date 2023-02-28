
struct Uniforms {
	gridProperties: vec4<f32>,      // hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,          // the size of the viewport
    gridResolution: vec2<u32>,      // resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for min values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for max values
    colorNull: vec4<f32>,           // color for empty cell
    colorPoints: vec4<f32>,         // color of the positions if activated

    sizePoints: f32,                // size of the positions if activated
    hoverIndex: i32,                // contains the id of the active grid cell
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>,        // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
    avgvalues: vec2<f32>,           // contains the average value for the given time ranges as outputed by the aggregation step
    nvalues: vec2<u32>              // contains the amount of values taken into account for the avgvalue as written by the aggregation step
}

struct TemperatureEntry {
    dm: u32,
    avgt: f32,
    src: u32
}

const AGGREGATE_WORKGROUP_SIZE:u32 = 64;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read_write> positions: array<PositionEntry>;
@group(0) @binding(3) var<storage, read> temperatures: array<TemperatureEntry>;


@compute @workgroup_size(AGGREGATE_WORKGROUP_SIZE)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>
) {
    let i: u32 = globalId.x;
    let N: u32 = arrayLength(&positions);
    let time_range_bounds:vec4<u32> = uniforms.timeRangeBounds;

    if (i < N) { // Guard against out-of-bounds workgroup sizes
        var p:PositionEntry = positions[i];
        p.nvalues = vec2<u32>(0,0);
        p.avgvalues = vec2<f32>(0.0, 0.0);
        for (var k:u32=p.index_bounds[0]; k <= p.index_bounds[1]; k++) {
            let t:TemperatureEntry = temperatures[k];
            if (uniforms.monthComparison > -1) {
                if ((t.dm + uniforms.firstMonthIndex) % 12 != u32(uniforms.monthComparison)) {
                    continue;
                }
            }
            if (t.dm >= time_range_bounds[0] && t.dm <= time_range_bounds[1]) {
                p.avgvalues.x += t.avgt;
                p.nvalues.x += 1;
            }
            if (t.dm >= time_range_bounds[2] && t.dm <= time_range_bounds[3]) {
                p.avgvalues.y += t.avgt;
                p.nvalues.y += 1;
            }
        }
        if (p.nvalues.x <= 0 && p.nvalues.y <= 0) {
            p.nvalues = vec2<u32>(0, 0);
            p.avgvalues = vec2<f32>(0.0, 0.0);
        }
        positions[i] = p;
    }

}