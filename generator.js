const puppeteer = require("puppeteer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.zimoluo.me/design";
  const cellSize = 512; // Default cell size
  const cellGap = 256; // Default gap size
  const padding = cellGap; // Padding equal to gap size
  const backgroundColor = { r: 240, g: 240, b: 240, alpha: 1 }; // Customizable background color
  const outputFileName = "output_grid.png";

  // Launch Puppeteer
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Go to the target URL
  await page.goto(url);

  // Get all SVG image URLs from the specified div
  const imageUrls = await page.evaluate(() => {
    const div = document.querySelector(
      ".settings-theme-picker_pickerGrid__mFGGz"
    );
    if (!div) return [];

    const imgElements = div.querySelectorAll("img");
    return Array.from(imgElements).map((img) => img.src);
  });

  console.log(`Found ${imageUrls.length} images.`);

  // Close the browser
  await browser.close();

  if (imageUrls.length === 0) {
    console.error("No images found. Exiting.");
    return;
  }

  // Directory to store downloaded SVGs and processed PNGs
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  // Download and process each SVG
  const pngPaths = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const svgPath = path.join(tempDir, `image_${i}.svg`);
    const pngPath = path.join(tempDir, `image_${i}.png`);

    // Fetch and save the SVG
    const response = await fetch(url);
    const svgContent = await response.text();
    fs.writeFileSync(svgPath, svgContent);

    // Use Sharp to convert SVG to PNG with a circular crop
    await sharp(svgPath)
      .resize(cellSize, cellSize)
      .composite([
        {
          input: Buffer.from(
            `<svg><circle cx="${cellSize / 2}" cy="${cellSize / 2}" r="${
              cellSize / 2
            }" fill="white"/></svg>`
          ),
          blend: "dest-in",
        },
      ])
      .toFile(pngPath);

    pngPaths.push(pngPath);
  }

  // Calculate grid dimensions
  const gridSize = Math.ceil(Math.sqrt(pngPaths.length));
  const outputSize =
    gridSize * cellSize + (gridSize - 1) * cellGap + 2 * padding;

  // Create the grid canvas
  const gridCanvas = sharp({
    create: {
      width: outputSize,
      height: outputSize,
      channels: 4,
      background: backgroundColor,
    },
  });

  // Composite the PNGs into the grid
  const composites = [];
  pngPaths.forEach((pngPath, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;

    const x = padding + col * (cellSize + cellGap);
    const y = padding + row * (cellSize + cellGap);

    composites.push({ input: pngPath, left: x, top: y });
  });

  // Save the final grid image
  await gridCanvas.composite(composites).toFile(outputFileName);

  console.log(`Grid image saved as ${outputFileName}`);

  // Cleanup temporary files
  pngPaths
    .concat(pngPaths.map((p) => p.replace(/\.png$/, ".svg")))
    .forEach((file) => {
      fs.unlinkSync(file);
    });
  fs.rmdirSync(tempDir);
})();
