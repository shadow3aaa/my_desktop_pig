#[cfg(windows)]
fn choose_drag_sleep_anchor(context: &PetContext) -> Option<Vec2> {
    let monitor = context.monitor?;
    let mut best_anchor = None;
    let mut best_distance = f64::MAX;
    let mut window_rects = Vec::<RECT>::new();

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let rects = unsafe { &mut *(lparam.0 as *mut Vec<RECT>) };

        if !unsafe { IsWindowVisible(hwnd) }.as_bool() || unsafe { IsIconic(hwnd) }.as_bool() {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return BOOL(1);
        }

        let mut process_id = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)); }
        if process_id == std::process::id() { return BOOL(1); }
        let width = (rect.right - rect.left) as f64;
        let height = (rect.bottom - rect.top) as f64;
        if width < WINDOW_SLEEP_ATTACH_MIN_WIDTH || height < WINDOW_SLEEP_ATTACH_MIN_HEIGHT {
            return BOOL(1);
        }

        rects.push(rect);
        BOOL(1)
    }

    let rects_ptr = &mut window_rects as *mut Vec<RECT>;
    let _ = unsafe { EnumWindows(Some(enum_windows_proc), LPARAM(rects_ptr as isize)) };

    for rect in window_rects {
        let min_x = rect.left as f64 + WINDOW_SLEEP_ATTACH_PADDING;
        let max_x = rect.right as f64 - context.window_size.width - WINDOW_SLEEP_ATTACH_PADDING;
        if max_x <= min_x {
            continue;
        }

        let anchor_x = context.position.x.clamp(min_x, max_x);
        let anchor_y = rect.top as f64 - context.window_size.height + (context.window_size.height * 0.09);
        let pet_center_x = context.position.x + context.window_size.width * 0.5;
        let within_top_band = (context.position.y - anchor_y).abs() <= WINDOW_SLEEP_DROP_Y_DISTANCE;
        let within_horizontal_range = pet_center_x
            >= rect.left as f64 - WINDOW_SLEEP_DROP_X_PADDING
            && pet_center_x <= rect.right as f64 + WINDOW_SLEEP_DROP_X_PADDING;

        if !within_top_band || !within_horizontal_range {
            continue;
        }

        if anchor_x < monitor.x + WINDOW_SLEEP_SCREEN_PADDING
            || anchor_x
                > monitor.x + monitor.width
                    - context.window_size.width
                    - WINDOW_SLEEP_SCREEN_PADDING
            || anchor_y < monitor.y + WINDOW_SLEEP_SCREEN_PADDING
            || anchor_y
                > monitor.y + monitor.height
                    - context.window_size.height
                    - WINDOW_SLEEP_SCREEN_PADDING
        {
            continue;
        }

        let distance = ((anchor_x - context.position.x).powi(2)
            + (anchor_y - context.position.y).powi(2))
        .sqrt();
        if distance >= best_distance {
            continue;
        }

        best_distance = distance;
        best_anchor = Some(Vec2 {
            x: anchor_x,
            y: anchor_y,
        });
    }

    best_anchor
}
