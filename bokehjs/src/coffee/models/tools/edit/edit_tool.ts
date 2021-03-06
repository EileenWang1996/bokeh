import * as p from "core/properties"
import {PointGeometry} from "core/geometry"
import {copy} from "core/util/array"
import {XYGlyph} from "models/glyphs/xy_glyph"
import {ColumnDataSource} from "models/sources/column_data_source"
import {GlyphRenderer} from "models/renderers/glyph_renderer"
import {GestureTool, GestureToolView} from "../gestures/gesture_tool"

export interface BkEv {
  bokeh: {
    sx: number
    sy: number
  }
  srcEvent: {
    shiftKey?: boolean
  }
  keyCode: number
  shiftKey: boolean
}

export interface HasCDS {
  data_source: ColumnDataSource
}

export interface HasXYGlyph {
  glyph: XYGlyph
}

export abstract class EditToolView extends GestureToolView {
  model: EditTool
  _basepoint: [number, number] | null
  _mouse_in_frame: boolean = true

  _move_enter(_e: BkEv): void {
    this._mouse_in_frame = true;
  }

  _move_exit(_e: BkEv): void {
    this._mouse_in_frame = false;
  }

  _map_drag(sx: number, sy: number, renderer: GlyphRenderer): [number, number] | null {
    // Maps screen to data coordinates
    const frame = this.plot_model.frame;
    if (!frame.bbox.contains(sx, sy)) {
      return null;
    }
    const x = frame.xscales[renderer.x_range_name].invert(sx);
    const y = frame.yscales[renderer.y_range_name].invert(sy);
    return [x, y];
  }

  _delete_selected(renderer: GlyphRenderer & HasCDS): void {
    // Deletes all selected rows in the ColumnDataSource
    const cds: any = renderer.data_source;
    const indices = cds.selected['1d'].indices;
    indices.sort()
    for (const column of cds.columns()) {
      let values = cds.data[column];
      if ((values.splice == null)) {
        // Convert typed arrays to regular arrays for editing
        cds.data[column] = (values = copy(values));
      }
      for (let index = 0; index < indices.length; index++) {
        const ind = indices[index];
        values.splice(ind-index, 1);
      }
    }
    cds.change.emit(undefined);
    cds.properties.data.change.emit(undefined);
    cds.selection_manager.clear();
  }

  _drag_points(e: BkEv, renderers: (GlyphRenderer & HasCDS & HasXYGlyph)[]): void {
    if (this._basepoint == null) { return; };
    const [bx, by] = this._basepoint;
    for (const renderer of renderers) {
      const basepoint = this._map_drag(bx, by, renderer);
      const point = this._map_drag(e.bokeh.sx, e.bokeh.sy, renderer);
      if (point == null || basepoint == null) {
        continue;
      }
      const [x, y] = point;
      const [px, py] = basepoint;
      const [dx, dy] = [x-px, y-py];
      // Type once dataspecs are typed
      const glyph: any = renderer.glyph;
      const ds = renderer.data_source;
      const [xkey, ykey] = [glyph.x.field, glyph.y.field];
      for (const index of ds.selected['1d'].indices) {
        if (xkey) { ds.data[xkey][index] += dx; }
        if (ykey) { ds.data[ykey][index] += dy; }
      }
    }
    for (const renderer of renderers) {
      renderer.data_source.change.emit(undefined);
    }
    this._basepoint = [e.bokeh.sx, e.bokeh.sy];
  }

  _pad_empty_columns(cds: ColumnDataSource, coord_columns: string[]): void {
    // Pad ColumnDataSource non-coordinate columns with empty_value
    for (const column of cds.columns()) {
      if (coord_columns.indexOf(column) === -1) {
        let values = cds.data[column];
        if ((values.push == null)) {
          cds.data[column] = (values = copy(values));
        }
        values.push(this.model.empty_value);
      }
    }
  }

  _select_event(e: BkEv, append: boolean, renderers: (GlyphRenderer & HasCDS)[]): (GlyphRenderer & HasCDS)[] {
    // Process selection event on the supplied renderers and return selected renderers
    const frame = this.plot_model.frame;
    const {sx, sy} = e.bokeh;
    if (!frame.bbox.contains(sx, sy)) {
      return [];
    }
    const geometry: PointGeometry = {
      type: 'point',
      sx: sx,
      sy: sy,
    }
    const selected = [];
    for (const renderer of renderers) {
      const sm = renderer.get_selection_manager();
      const cds = renderer.data_source;
      const views = [this.plot_view.renderer_views[renderer.id]];
      const did_hit = sm.select(views, geometry, true, append);
      if (did_hit) {
        selected.push(renderer)
      }
      cds.properties.selected.change.emit(undefined);
    }
    return selected;
  }
}

export abstract class EditTool extends GestureTool {
  empty_value: any
  renderers: (GlyphRenderer & HasCDS)[]
}

EditTool.prototype.type = "EditTool"

// EditTool.prototype.default_view = null

EditTool.define({
  empty_value: [ p.Any ],
  renderers:   [ p.Array, [] ],
})
