import { AnyMxRecord } from "dns";
import $ from "jquery";

import * as renderer from './renderer';

require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/progressbar');
require('jquery-ui/ui/widgets/selectmenu');
require('jquery-ui/ui/widgets/slider');
require('jquery-ui/ui/widgets/accordion');
require('jquery-ui/ui/effects/effect-drop');
require('jquery-ui/ui/effects/effect-fade');
require('jquery-ui/ui/widgets/checkboxradio');
require('vanderlee-colorpicker/jquery.colorpicker');

// Shows the error message when webgpu is not available on current browser
export const ShowNoWebGpuWarning = () => {
    $("body").addClass("error").removeClass("loading");
    $("#nowebgpu").position({ my: "center center", at: "center center", of: window }).fadeIn(800);
}

// Internal function to handle keydown events.
const keyDownHandler = (e:any) => {
  if (e.keyCode == 85) {  // Key: U
    // Hide/Show UI
    let isShown = $("#mainMenu").dialog("isOpen");
    if (isShown) {
      $( "#mainMenu" ).dialog("close");
      $("#footer").fadeOut(800);
    } else {
      $( "#mainMenu" ).dialog("open");
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
  $("#loadingDialog").dialog({
    position: { my: "center center", at: "center center", of: window },
    autoOpen: true,
    minWidth: 400,
    hide: {
        effect: "fade",
        duration: 800
      }
  });
  $( "#pbLoading" ).progressbar({
    value: false
  });
  $( "#mainMenu" ).dialog({
      position: { my: "left top", at: "left+0 top+0", of: window },
      dialogClass: "no-close",
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

    $( "#s-gscale" ).slider({
      min: 2,
      max: 50,
      value: 6,
      slide: function( _event: any, ui: any ) {
        $( "#lbl-gscale" ).html((ui.value / 1000).toString());
      }
    }).on("slidestop", (e:any, ui:any) => {
      renderer.uniformBuffer.set_gridscale(ui.value / 1000);
      renderer.renderFrame(true);
    });

    $( "#s-gborder" ).slider({
      min: 0,
      max: 80,
      value: 10,
      slide: function( _event: any, ui: any ) {
        let newValue = ui.value / 100;
        $( "#lbl-gborder" ).html(newValue.toString());
        renderer.uniformBuffer.gridProperties.border = newValue;
        renderer.renderFrame(false, false, true);
      }
    });
    $("#s-compare").selectmenu();
    $("#s-colormode").selectmenu({
      change: function( event: any, data: any ) {
        renderer.uniformBuffer.colorMode_u32 = +data.item.value;
        if (renderer.uniformBuffer.colorMode_u32 == 0) {
          $("#cp-colb-group").hide();
        } else {
          $("#cp-colb-group").show();
        }
        renderer.renderFrame(false, false, true);
      }
    });
    $("#cp-cola").colorpicker({
      alpha: true,
      colorFormat: "RGBA",
      select: (event:any, data:any) => {
        renderer.uniformBuffer.colorA = { x_f32: data.rgb.r, y_f32: data.rgb.g, z_f32: data.rgb.b, w_f32: data.a };
        renderer.renderFrame(false, false, true);
      }
    });
    $("#cp-colb").colorpicker({
      alpha: true,
      colorFormat: "RGBA",
      select: (event:any, data:any) => {
        renderer.uniformBuffer.colorB = { x_f32: data.rgb.r, y_f32: data.rgb.g, z_f32: data.rgb.b, w_f32: data.a };
        renderer.renderFrame(false, false, true);
      }
    });    
    $("#cp-colc").colorpicker({
      alpha: true,
      colorFormat: "RGBA",
      select: (event:any, data:any) => {
        renderer.uniformBuffer.colorC = { x_f32: data.rgb.r, y_f32: data.rgb.g, z_f32: data.rgb.b, w_f32: data.a };
        renderer.renderFrame(false, false, true);
      }
    });
    ($("#cb-gaspect") as any).checkboxradio({
      icon: true
    }).on("change", (event:any) => {
      renderer.uniformBuffer.gridAspect_u32 = $(event.target).is(":checked") ? 1 : 0;
      renderer.renderFrame(true);
    });
    $("#mainMenuAccordion").accordion({
      heightStyle: "content",
      collapsible: true
    });
}

export const showFooter = () => {
    $("#footer").fadeIn(800);
}

export const showMainMenu = () => {
    $( "#mainMenu" ).dialog( "open" );
}

export const showCanvas = () => {
    $("#canvas-webgpu").fadeIn(800);
}

export const loadingDialogAddHistory = (msg:string) => {
    let html = `<tr class="done"><td><span class="material-symbols-outlined">check</span></td><td>${msg}</td></tr>`;
    $("#tblLoading .history").prepend(html);
}

export const loadingDialogProgress = (val:number) => {
    if (val < 0) {
        $( "#pbLoading" ).progressbar( "option", {value: false});
    } else {
        $( "#pbLoading" ).progressbar( "option", {value: val * 100});
    }
}

export const loadingDialogLabel = (msg:string) => {
    $("#lblLoading").html(msg + " ...");
}

export const loadingDialogError = (msg:string) => {
  $("#lblLoading").html(msg);
  $("#spLoading").removeClass("animated").html("error");
  $( "#pbLoading" ).progressbar( "option", {value: false, disabled: true});
  $("body").addClass("error").removeClass("loading");
}

export const loadingDialogSuccess = (msg:string) => {
  $("#lblLoading").html(msg);
  $("#spLoading").removeClass("animated").html("done_all");
  $( "#pbLoading" ).progressbar( "option", {value: 0, disabled: true});
  $("body").removeClass("loading").addClass("map");
  setTimeout(()=> {$("#loadingDialog").dialog( "close" )}, 800);
}
