import { Vec4_f32 } from "./rendering/vectors";

export const CheckWebGPU = () => {
    return "gpu" in navigator;
}

export const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message
    return "";
}

export const getMonthDifference = (d1: Date, d2: Date): number => {
    var months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months;
}

export const formatMilliseconds = (s: number):string => {
    if (s < 1000) {
        return `${s.toFixed(0)} ms`;
    } else if (s < 60000) {
        return `${(s / 1000).toFixed(2)} s`;
    } else if (s < 3600000) {
        return `${(s / 60000).toFixed(2)} min`;
    } else {
        return `${(s / 3600000).toFixed(2)} h`;
    }
}

export const formatUIntNumbers = (n:number):string => {
    if (n > 10**6) {
        return `${(n / 10**6).toFixed(2)} M`
    } else if (n > 10**3) {
        return `${(n / 10**3).toFixed(2)} k`
    }
    return n.toString();
}

export const formatFileSize = (bytes:number, digits:number=2):string => {
    if (bytes < 1024) {
        return `${bytes} B`;
    } else if (bytes < 1024*1024) {
        return `${(bytes / 1024).toFixed(digits)} kB`;
    } else {
        return `${(bytes / (1024*1024)).toFixed(digits)} MB`;
    }
}

export const colToString = (col: Vec4_f32):string => {
    return `rgba(${(col.x_f32 * 255).toFixed(0)},${(col.y_f32 * 255).toFixed(0)},${(col.z_f32 * 255).toFixed(0)}, ${(col.w_f32).toFixed(4)})`;
}

export const createGpuBuffer = <T extends Uint8Array | Uint32Array | Float32Array>(
    device: GPUDevice,
    data: ArrayLike<number> | ArrayBufferLike,
    type: new(array: ArrayLike<number> | ArrayBufferLike) => T,
    usageFlags: GPUBufferUsageFlags
): GPUBuffer => {
    const dataArray = new type(data);

    const buffer = device.createBuffer({
        size: dataArray.byteLength,
        usage: usageFlags,
        mappedAtCreation: true
    });

    new type(buffer.getMappedRange()).set(dataArray);
    buffer.unmap();
    return buffer;
}

export const freeGpuBuffer = (buffer:GPUBuffer) => {
    if (buffer) buffer.destroy();
}

export const createEmptyGPUBuffer = (
    device: GPUDevice,
    size: number,
    usageFlag: GPUBufferUsageFlags
): GPUBuffer => {
    return device.createBuffer({
        size: size,
        usage: usageFlag
    });
}

export const degrees_to_radians = (degrees:number) : number => {
    return degrees * (Math.PI/180);
}

export const radians_to_degrees = (radians:number) : number => {
    return radians * (180.0/Math.PI);
}

export const euclid_distance = (a:any, b:any) : number => {
    let dx = a.x-b.x;
    let dy = a.y-b.y;
    return dx*dx + dy*dy;
}

export const dec2bin = (dec:number):string => {
    return (dec >>> 0).toString(2);
}

export const discretize = (val:number, valmin:number, valmax:number, omax:number):number => {
    let p = (val - valmin) / (valmax - valmin);
    return Math.ceil(p * omax);
}

export const undiscretize = (disval:number, valmin:number, valmax:number, omax:number):number => {
    return (disval / omax) * (valmax - valmin) + valmin;
}