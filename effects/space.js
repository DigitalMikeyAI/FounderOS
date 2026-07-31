// =====================================================
// FOUNDEROS — LIGHTWEIGHT STARFIELD RENDERER
// Drives #starfield (full page) and #viewport-space (hero)
// =====================================================

function initStarfield(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const density = options.density || 0.00012;
  const maxStars = options.maxStars || 220;

  let stars = [];
  let width = 0;
  let height = 0;
  let frame = 0;

  function resize() {
    const parent = canvas.parentElement;
    width = canvas.width = (parent ? parent.clientWidth : window.innerWidth);
    height = canvas.height = (parent ? parent.clientHeight : window.innerHeight);

    const count = Math.min(maxStars, Math.floor(width * height * density));

    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.3,
      speed: Math.random() * 0.15 + 0.02,
      twinkleOffset: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.85 ? "#38dfff" : "#ffffff",
    }));
  }

  function draw() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      const twinkle =
        0.5 + 0.5 * Math.sin(frame * 0.02 + star.twinkleOffset);

      ctx.globalAlpha = 0.25 + twinkle * 0.6;
      ctx.fillStyle = star.hue;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();

      star.y += star.speed;

      if (star.y > height) {
        star.y = 0;
        star.x = Math.random() * width;
      }
    });

    ctx.globalAlpha = 1;

    requestAnimationFrame(draw);
  }

  resize();
  draw();

  window.addEventListener("resize", resize);
}

initStarfield("starfield", { density: 0.00015, maxStars: 260 });
initStarfield("viewport-space", { density: 0.0003, maxStars: 140 });
