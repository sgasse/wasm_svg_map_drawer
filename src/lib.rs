/// WASM dynamic map drawer.
///
/// Extract dynamic paths from a SVG and draw them on a canvas drawing context
/// with WASM.
///
use std::{collections::HashMap, str::FromStr};
use svgtypes::{PathParser, PathSegment, ViewBox};
use wasm_bindgen::prelude::*;
use web_sys::console;

// Fill style for hovered shapes and fallback style if no specific is given
static HOVER_FILL_STYLE: &str = "rgba(107,148,179,0.2)";
static DEFAULT_FILL_STYLE: &str = "rgba(255,255,255,0.2)";

pub fn set_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// WASM object to draw the interactive part of the map.
#[wasm_bindgen]
pub struct MapDrawerInterface {
    view_box: ViewBox,
    dynamic_shapes: HashMap<String, Vec<PathSegment>>,
    shape_states: HashMap<String, i32>,
    state_fill_styles: HashMap<i32, String>,
}

#[wasm_bindgen]
impl MapDrawerInterface {
    pub fn new() -> Self {
        // The panic hook propagates the exact messages from `.expect` to the JS
        // console and is really useful in development.
        set_panic_hook();
        console::log_1(&"Created MapDrawerInterface".into());
        Self {
            view_box: ViewBox::new(0.0, 0.0, 0.0, 0.0),
            dynamic_shapes: HashMap::new(),
            shape_states: HashMap::new(),
            state_fill_styles: HashMap::new(),
        }
    }

    pub fn parse_svg(&mut self, svg_content: &str) {
        console::log_1(&format!("{:?}", svg_content).into());
        let doc = roxmltree::Document::parse(svg_content).expect("Parse SVG document");
        let svg_root = doc
            .descendants()
            .find(|n| n.has_tag_name("svg"))
            .expect("SVG Root");

        let view_box = ViewBox::from_str(svg_root.attribute("viewBox").expect("View box"))
            .expect("viewBox from string");
        self.view_box = view_box;

        for elem in doc.descendants().filter(|n| n.has_tag_name("path")) {
            console::debug_1(&format!("{:?}", elem).into());
            match elem.attribute("id") {
                Some(id) => {
                    if id.starts_with("dynamic") {
                        self.dynamic_shapes
                            .insert(id.to_owned(), get_path_vec(elem));
                    }
                }
                None => {}
            }
        }

        console::log_1(&format!("Found dynamic shapes: {:?}", self.dynamic_shapes).into());
    }

    pub fn get_dynamic_shape_for_pos(
        &self,
        ctx: web_sys::CanvasRenderingContext2d,
        rel_mouse_x: f64,
        rel_mouse_y: f64,
    ) -> Option<String> {
        for (shape_id, path_vec) in self.dynamic_shapes.iter() {
            define_path(&ctx, path_vec);
            let Point { x, y } = self.get_point_on_canvas(rel_mouse_x, rel_mouse_y);

            if ctx.is_point_in_path_with_f64(x, y) {
                return Some(shape_id.clone());
            }
        }

        None
    }

    pub fn draw_svg_with_x_y(
        &self,
        ctx: web_sys::CanvasRenderingContext2d,
        rel_mouse_x: f64,
        rel_mouse_y: f64,
    ) {
        let canvas = ctx.canvas().expect("Get canvas");
        canvas.set_width(self.view_box.w as u32);
        canvas.set_height(self.view_box.h as u32);

        // Draw dynamic shapes
        for (shape_id, path_vec) in self.dynamic_shapes.iter() {
            let fill_style = match self.shape_states.get(shape_id) {
                Some(state) => match self.state_fill_styles.get(state) {
                    Some(style) => style,
                    None => DEFAULT_FILL_STYLE,
                },
                None => DEFAULT_FILL_STYLE,
            };
            draw_path(
                &ctx,
                fill_style,
                path_vec,
                self.get_point_on_canvas(rel_mouse_x, rel_mouse_y),
            );
        }
    }

    pub fn set_shape_state(&mut self, shape_id: String, state: i32) {
        self.shape_states.insert(shape_id, state);
    }

    pub fn set_state_fill_style(&mut self, state: i32, fill_style: String) {
        self.state_fill_styles.insert(state, fill_style);
    }

    fn get_point_on_canvas(&self, rel_x: f64, rel_y: f64) -> Point {
        let x = rel_x * self.view_box.w;
        let y = rel_y * self.view_box.h;
        Point { x, y }
    }
}

/// Parse a path vector from a XML node.
fn get_path_vec(elem: roxmltree::Node) -> Vec<PathSegment> {
    PathParser::from(elem.attribute("d").expect("Path instructions"))
        .filter_map(|p| p.ok())
        .collect()
}

/// Define a path on the canvas.
///
/// This defines a path by running all instructions other than `ctx.fill()` and
/// `ctx.stroke()` and can be used to identify if a position is part of a path
/// without redrawing it.
fn define_path(ctx: &web_sys::CanvasRenderingContext2d, path_vec: &Vec<PathSegment>) {
    ctx.begin_path();
    let mut abs_x = 0.0;
    let mut abs_y = 0.0;
    for path_seg in path_vec {
        match path_seg {
            PathSegment::MoveTo { abs, x, y } => {
                update_abs_x_y(abs, &mut abs_x, &mut abs_y, Some(*x), Some(*y));
                ctx.move_to(abs_x, abs_y)
            }
            PathSegment::LineTo { abs, x, y } => {
                update_abs_x_y(abs, &mut abs_x, &mut abs_y, Some(*x), Some(*y));
                ctx.line_to(abs_x, abs_y);
            }
            PathSegment::HorizontalLineTo { abs, x } => {
                update_abs_x_y(abs, &mut abs_x, &mut abs_y, Some(*x), None);
                ctx.line_to(abs_x, abs_y);
            }
            PathSegment::VerticalLineTo { abs, y } => {
                update_abs_x_y(abs, &mut abs_x, &mut abs_y, None, Some(*y));
                ctx.line_to(abs_x, abs_y);
            }

            PathSegment::ClosePath { abs: _ } => ctx.close_path(),
            _ => {}
        }
    }
}

/// Draw path.
///
/// If we are hovering on a shape defined by a path, fill with the hover style,
/// otherwise fill with the style given for this shape (based on the state).
fn draw_path(
    ctx: &web_sys::CanvasRenderingContext2d,
    state_fill_style: &str,
    path_vec: &Vec<PathSegment>,
    mouse_pos: Point,
) {
    define_path(ctx, path_vec);

    let Point { x, y } = mouse_pos;

    if ctx.is_point_in_path_with_f64(x, y) {
        // Fill with hover style
        ctx.set_fill_style(&JsValue::from(HOVER_FILL_STYLE));
    } else {
        // Fill with style for this state
        ctx.set_fill_style(&JsValue::from(state_fill_style));
    }

    ctx.fill();
    ctx.stroke();
}

/// Update the absolute x and y coordinates.
///
/// Some drawing instructions are given in SVG with relative coordinates,
/// but the canvas API expects absolute coordinates. This function updates the
/// coordinates to always be absolute for the SVG instructions that we use.
fn update_abs_x_y(abs: &bool, abs_x: &mut f64, abs_y: &mut f64, x: Option<f64>, y: Option<f64>) {
    match (abs, x, y) {
        (true, Some(x), Some(y)) => {
            *abs_x = x;
            *abs_y = y;
        }
        // Horizontal Line
        (true, Some(x), None) => {
            *abs_x = x;
        }
        // Vertical Line
        (true, None, Some(y)) => {
            *abs_y = y;
        }
        (false, Some(x), Some(y)) => {
            *abs_x = x + *abs_x;
            *abs_y = y + *abs_y;
        }
        // Horizontal Line
        (false, Some(x), None) => {
            *abs_x = x + *abs_x;
        }
        // Vertical Line
        (false, None, Some(y)) => {
            *abs_y = y + *abs_y;
        }
        _ => {}
    }
}

/// A point with x and y coordinate.
struct Point {
    x: f64,
    y: f64,
}
