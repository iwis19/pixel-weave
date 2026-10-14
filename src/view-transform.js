const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const MIN_ZOOM = .05, MAX_ZOOM = 16;

export class ViewTransform {
  constructor() { this.width = this.height = this.imageWidth = this.imageHeight = 1; this.scale = 1; this.x = this.y = 0; this.fitted = true; }
  resize(width, height, imageWidth = this.imageWidth, imageHeight = this.imageHeight) {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.imageWidth = Math.max(1, imageWidth); this.imageHeight = Math.max(1, imageHeight);
    if (this.fitted) this.fit(); else this.boundPan();
  }
  fit() {
    this.scale = clamp(Math.min(this.width / this.imageWidth, this.height / this.imageHeight), MIN_ZOOM, MAX_ZOOM);
    this.x = this.y = 0; this.fitted = true;
  }
  actual() { this.scale = 1; this.x = this.y = 0; this.fitted = false; }
  zoom(scale, x = this.width / 2, y = this.height / 2) {
    const next = clamp(scale, MIN_ZOOM, MAX_ZOOM);
    const ratio = next / this.scale;
    this.x = x - this.width / 2 - (x - this.width / 2 - this.x) * ratio;
    this.y = y - this.height / 2 - (y - this.height / 2 - this.y) * ratio;
    this.scale = next; this.fitted = false; this.boundPan();
  }
  pan(dx, dy) { this.x += dx; this.y += dy; this.fitted = false; this.boundPan(); }
  boundPan() {
    const maxX = Math.max(0, (this.width + this.imageWidth * this.scale) / 2 - 32);
    const maxY = Math.max(0, (this.height + this.imageHeight * this.scale) / 2 - 32);
    this.x = clamp(this.x, -maxX, maxX); this.y = clamp(this.y, -maxY, maxY);
  }
}
