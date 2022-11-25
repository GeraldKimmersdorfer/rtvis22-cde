
// Returns true if current browser supports WebGPU
export const CheckWebGPU = () => {
  return "gpu" in navigator;
}

export const formatMilliseconds = (s:number) =>  {
  if (s < 1000) {
    return `${s.toFixed(0)} ms`;
  } else if (s < 60000) {
    return `${(s/1000).toFixed(2)} s`;
  } else if (s < 3600000) {
    return `${(s/60000).toFixed(2)} min`;
  } else {
    return `${(s/3600000).toFixed(2)} h`;
  }
}