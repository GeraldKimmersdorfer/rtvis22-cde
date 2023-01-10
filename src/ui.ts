import { AnyMxRecord } from "dns";
import $ from "jquery";
import { DB } from "./db";
import { getMonthDifference } from "./helper";

import * as renderer from './renderer';
import { GridBuffer } from "./rendering/buffer";

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

class ComputeTimeHolder {

  frameTimes:{[id: string] : {
    name:string,
    vals:number[]
  }} = {};

  constructor() {
      this.frameTimes = {
        agg: { name: "Aggregate", vals: []},
        avg: { name: "Averaging", vals: []},
        rend: { name: "Rendering", vals: []},
        wback: { name: "WriteBack", vals: []}
      }
  }

  pushTime(id:string, time:number) {
    if (this.frameTimes[id].vals.push(time) > 60) {
      this.frameTimes[id].vals.shift();
    }
    let avg = this.frameTimes[id].vals.reduce((a,b) => a + b, 0) / this.frameTimes[id].vals.length;
    $("#lbl-" + id + "time").html(time.toString() + " ms (Ø " + avg.toFixed(2) + ")");
  }
}

export const TH:ComputeTimeHolder = new ComputeTimeHolder();

// Internal function to handle keydown events.
const keyDownHandler = (e:any) => {
  if (e.keyCode == 85) {  // Key: U
    // Hide/Show UI
    let isShown = $("#mainMenu").dialog("isOpen");
    if (isShown) {
      hideMainMenu();
      hideFooter();
      hideInfoMenu();
    } else {
      showMainMenu();
      showFooter();
      showFooter();
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
  $( "#infoMenu" ).dialog({
    position: { my: "right top", at: "right top", of: window },
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
      values: [ 1990, 2000 ],
      slide: function( _event: any, ui: any ) {
        var start = new Date(ui.values[0], 0, 1);
        var end = new Date(ui.values[1], 11, 30);
        if (start < DB.bounds_date.min) start = DB.bounds_date.min;
        if (end > DB.bounds_date.max) end = DB.bounds_date.max;
        renderer.uniformBuffer.timeRangeBounds.x_u32 = getMonthDifference(DB.bounds_date.min, start);
        renderer.uniformBuffer.timeRangeBounds.y_u32 = getMonthDifference(DB.bounds_date.min, end);
        $( "#lbl-tra" ).html(ui.values[ 0 ] + " - " + ui.values[ 1 ] );
      }
    }).on("slidestop", (e:any, ui:any) => {
      renderer.renderFrame(false, false, false, true);
    });
    $( "#s-trb" ).slider({
      range: true,
      min: 1800,
      max: 2020,
      values: [ 2000, 2013 ],
      slide: function( _event: any, ui: any ) {
        var start = new Date(ui.values[0], 0, 1);
        var end = new Date(ui.values[1], 11, 30);
        if (start < DB.bounds_date.min) start = DB.bounds_date.min;
        if (end > DB.bounds_date.max) end = DB.bounds_date.max;
        renderer.uniformBuffer.timeRangeBounds.z_u32 = getMonthDifference(DB.bounds_date.min, start);
        renderer.uniformBuffer.timeRangeBounds.w_u32 = getMonthDifference(DB.bounds_date.min, end);
        
        $( "#lbl-trb" ).html(ui.values[ 0 ] + " - " + ui.values[ 1 ] );
      }
    }).on("slidestop", (e:any, ui:any) => {
      console.log(renderer.uniformBuffer.timeRangeBounds);
      renderer.renderFrame(false, false, false, true);
    });

    $( "#s-gscale" ).slider({
      min: 2,
      max: 50,
      value: 10,
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
    $("#s-compare").selectmenu({
      change: function( event: any, data: any ) {
        renderer.uniformBuffer.monthComparison_i32 = +data.item.value;
        renderer.renderFrame(false, false, false, true);
      }
    });
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
    $("#cp-colnull").colorpicker({
      alpha: true,
      colorFormat: "RGBA",
      select: (event:any, data:any) => {
        renderer.uniformBuffer.colorNull = { x_f32: data.rgb.r, y_f32: data.rgb.g, z_f32: data.rgb.b, w_f32: data.a };
        renderer.renderFrame(false, false, true);
      }
    });
    ($("#cb-gaspect") as any).checkboxradio({
      icon: true
    }).on("change", (event:any) => {
      renderer.uniformBuffer.set_respect_aspect($(event.target).is(":checked"));
      renderer.renderFrame(true);
    });
    $("#mainMenuAccordion,#infoMenuAccordion").accordion({
      heightStyle: "content",
      collapsible: true
    });

    var delayTimer:any;
    $("#canvas-webgpu").mousemove((e:any) => {
      clearTimeout(delayTimer);
      delayTimer = setTimeout(() => {
        let hc = renderer.uniformBuffer.determine_hover_cell(e.clientX, e.clientY);
        renderer.renderFrame(false, false, true);
        if (hc.i > 0) {
          $("#cinfo-group").show(200);
          let gridData = renderer.gridBuffer.data[renderer.uniformBuffer.hoverIndex_i32];
          $("#lbl-curval").html(gridData.value.toFixed(5) + " °C");
          $("#lbl-curn").html(gridData.valueN.toFixed(0));
          $("#lbl-curcoord").html(hc.col.toFixed(0) + " | " + hc.row.toFixed(0) + " (" + hc.i + ")");
          
        }

        
      }, 5);
      
    }).mouseleave(() => {
      setTimeout(() => {
        renderer.uniformBuffer.hoverIndex_i32 = -1;
        renderer.renderFrame(false, false, true);
        $("#cinfo-group").hide(200);
      }, 5);
    });
}

export const initWithData = () => {
  $( "#s-tra" ).slider({
    min: DB.bounds_date.min.getFullYear(),
    max: DB.bounds_date.max.getFullYear()
  });
  $( "#s-trb" ).slider({
    min: DB.bounds_date.min.getFullYear(),
    max: DB.bounds_date.max.getFullYear()
  });
}

export const refreshGraphInformation = (buff:GridBuffer) => {
  let info = buff.get_stats();
  $("#lbl-aggrmax").html(info.max.toFixed(5) + " °C");
  $("#lbl-aggrmin").html(info.min.toFixed(5) + " °C");
  $("#lbl-aggravg").html(info.avg.toFixed(5) + " °C");
  $("#lbl-aggrn").html(info.n_total.toString());
}

export const showFooter = () => {
    $("#footer").fadeIn(800);
}

export const hideFooter = () => {
  $("#footer").fadeOut(800);
}

export const showMainMenu = () => {
    $( "#mainMenu" ).dialog( "open" );  
}

export const hideMainMenu = () => {
  $( "#mainMenu" ).dialog( "close" );  
}

export const showInfoMenu = () => {
  $("#infoMenu").dialog("open");
}

export const hideInfoMenu = () => {
  $("#infoMenu").dialog("close");
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
