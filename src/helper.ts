
import $ from "jquery";
import "jquery-ui-dist/jquery-ui";

// Shows the error message when webgpu is not available on current browser
export const ShowNoWebGpuWarning = () => {
  $("#nowebgpu").position({ my: "center center", at: "center center", of: window }).fadeIn(800);
}

// Internal function to handle keydown events.
const keyDownHandler = (e:any) => {
  if (e.keyCode == 85) {  // Key: U
    // Hide/Show UI
    let isShown = $("#dialog").dialog("isOpen");
    if (isShown) {
      $( "#dialog" ).dialog("close");
      $("#footer").fadeOut(800);
    } else {
      $( "#dialog" ).dialog("open");
      $("#footer").fadeIn(800);
    }
  }
}

// Initializes the jQuery UI elements (Should be called once at dom load)
export const InitUserInterface = () => {
  const canvas = $("#canvas-webgpu").get(0) as HTMLCanvasElement;
  if(canvas){
      function windowResize() {
          canvas.width  = window.innerWidth;
          canvas.height = window.innerHeight;
      };
      window.addEventListener('resize', windowResize);
      window.addEventListener('keydown', keyDownHandler);
      windowResize();
  }

  $( "#dialog" ).dialog({
      position: { my: "left top", at: "left+10 top+10", of: window },
      dialogClass: "no-close",
      autoOpen: false,
      show: {
        effect: "drop",
        duration: 800
      },
      hide: {
        effect: "drop",
        duration: 800
      }
  });
  $( "#s-tra" ).slider({
      range: true,
      min: 1800,
      max: 2020,
      values: [ 1850, 1890 ],
      slide: function( _event: any, ui: any ) {
        $( "#lbl-tra" ).html(ui.values[ 0 ] + " - " + ui.values[ 1 ] );
      }
    });
    $( "#s-trb" ).slider({
      range: true,
      min: 1800,
      max: 2020,
      values: [ 1950, 1990 ],
      slide: function( _event: any, ui: any ) {
        $( "#lbl-trb" ).html(ui.values[ 0 ] + " - " + ui.values[ 1 ] );
      }
    });
    $( "#s-compare" ).selectmenu();

    $( "#dialog" ).dialog( "open" );
    $("#footer").fadeIn(800);
}

// Returns true if current browser supports WebGPU
export const CheckWebGPU = () => {
  return "gpu" in navigator;
}