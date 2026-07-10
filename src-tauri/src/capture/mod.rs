use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::Duration,
};

use image::{ImageBuffer, Rgba};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

pub(crate) mod desktop;
#[cfg(windows)]
mod windows;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const POLL_ATTEMPTS: usize = 120;

struct ClipboardImage {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

impl ClipboardImage {
    fn fingerprint(&self) -> u64 {
        let mut hasher = DefaultHasher::new();
        self.width.hash(&mut hasher);
        self.height.hash(&mut hasher);
        self.rgba.hash(&mut hasher);
        hasher.finish()
    }
}

pub(crate) async fn read_image(app: &AppHandle) -> Result<PathBuf, String> {
    save_image(app, clipboard_image(app)?).await
}

pub(crate) async fn select_region(app: &AppHandle) -> Result<PathBuf, String> {
    let before = clipboard_image(app).ok().map(|image| image.fingerprint());
    launch_region_selector()?;
    for _ in 0..POLL_ATTEMPTS {
        tokio::time::sleep(POLL_INTERVAL).await;
        if let Ok(image) = clipboard_image(app) {
            if Some(image.fingerprint()) != before {
                return save_image(app, image).await;
            }
        }
    }
    Err("screen capture canceled or timed out".into())
}

fn clipboard_image(app: &AppHandle) -> Result<ClipboardImage, String> {
    let image = app
        .clipboard()
        .read_image()
        .map_err(|error| error.to_string())?;
    Ok(ClipboardImage {
        rgba: image.rgba().to_vec(),
        width: image.width(),
        height: image.height(),
    })
}

async fn save_image(app: &AppHandle, image: ClipboardImage) -> Result<PathBuf, String> {
    let directory = capture_directory(app)?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{}.png", uuid::Uuid::new_v4()));
    write_png(&image.rgba, image.width, image.height, &path)?;
    Ok(path)
}

fn write_png(rgba: &[u8], width: u32, height: u32, path: &Path) -> Result<(), String> {
    let image = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| "clipboard image buffer has invalid dimensions".to_string())?;
    image.save(path).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn launch_region_selector() -> Result<(), String> {
    windows::launch_region_selector()
}

#[cfg(not(windows))]
fn launch_region_selector() -> Result<(), String> {
    Err("screen capture is not supported on this platform".into())
}

fn capture_directory(app: &AppHandle) -> Result<PathBuf, String> {
    crate::runtime_data_dir(app).map(|directory| directory.join("captures"))
}

pub(crate) fn cleanup_stale(app: &AppHandle, keep_paths: &HashSet<PathBuf>) -> Result<(), String> {
    cleanup_capture_dir(&capture_directory(app)?, keep_paths)
}

pub(crate) fn remove_managed(app: &AppHandle, path: &Path) -> Result<bool, String> {
    remove_capture_path(&capture_directory(app)?, path)
}

fn cleanup_capture_dir(directory: &Path, keep_paths: &HashSet<PathBuf>) -> Result<(), String> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let mut first_error = None;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                first_error.get_or_insert_with(|| error.to_string());
                continue;
            }
        };
        let is_file = match entry.file_type() {
            Ok(file_type) => file_type.is_file(),
            Err(error) => {
                first_error.get_or_insert_with(|| error.to_string());
                continue;
            }
        };
        if is_file && !keep_paths.contains(&entry.path()) {
            if let Err(error) = std::fs::remove_file(entry.path()) {
                first_error.get_or_insert_with(|| error.to_string());
            }
        }
    }
    first_error.map_or(Ok(()), Err)
}

fn remove_capture_path(directory: &Path, path: &Path) -> Result<bool, String> {
    if path.parent() != Some(directory) {
        return Ok(false);
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{cleanup_capture_dir, remove_capture_path, write_png};

    #[test]
    fn writes_clipboard_rgba_as_png() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("clipboard.png");

        write_png(&[0x2b, 0x36, 0xe8, 0xff], 1, 1, &path).unwrap();

        assert_eq!(&std::fs::read(path).unwrap()[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn cleanup_keeps_unfinished_captures_and_ignores_other_paths() {
        let root = tempfile::tempdir().unwrap();
        let captures = root.path().join("captures");
        let nested = captures.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        let keep = captures.join("keep.png");
        let stale = captures.join("stale.png");
        let nested_file = nested.join("nested.png");
        let outside = root.path().join("outside.png");
        for path in [&keep, &stale, &nested_file, &outside] {
            std::fs::write(path, b"image").unwrap();
        }

        cleanup_capture_dir(&captures, &HashSet::from([keep.clone()])).unwrap();

        assert!(keep.exists());
        assert!(!stale.exists());
        assert!(nested_file.exists());
        assert!(outside.exists());
    }

    #[test]
    fn terminal_cleanup_only_removes_direct_capture_files() {
        let root = tempfile::tempdir().unwrap();
        let captures = root.path().join("captures");
        std::fs::create_dir_all(&captures).unwrap();
        let capture = captures.join("capture.png");
        let outside = root.path().join("outside.png");
        std::fs::write(&capture, b"image").unwrap();
        std::fs::write(&outside, b"image").unwrap();

        assert!(remove_capture_path(&captures, &capture).unwrap());
        assert!(!remove_capture_path(&captures, &outside).unwrap());
        assert!(!capture.exists());
        assert!(outside.exists());

        let missing = captures.join("missing.png");
        assert!(!remove_capture_path(&captures, &missing).unwrap());
    }
}
