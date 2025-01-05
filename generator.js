const puppeteer = require("puppeteer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://www.zimoluo.me/design";
  const cellSize = 512; // Default cell size for the smaller icons
  const borderCellSize = 580; // Size for the larger background circles
  const cellGap = 256; // Default gap size
  const padding = cellGap; // Padding equal to gap size
  const backgroundColor = { r: 240, g: 240, b: 240, alpha: 1 }; // Customizable background color
  const borderColor = { r: 180, g: 180, b: 180, alpha: 0.8 }; // Border color for the larger circle
  const outputFileName = "output_grid_with_border.png";

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
    const borderPngPath = path.join(tempDir, `border_image_${i}.png`);

    // Fetch and save the SVG
    const response = await fetch(url);
    const svgContent = await response.text();
    fs.writeFileSync(svgPath, svgContent);

    // Use Sharp to convert SVG to PNG with a circular crop (regular icons)
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

    // Create larger circular borders (border icons)
    await sharp({
      create: {
        width: borderCellSize,
        height: borderCellSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg><circle cx="${borderCellSize / 2}" cy="${
              borderCellSize / 2
            }" r="${borderCellSize / 2}" fill="rgba(${borderColor.r}, ${
              borderColor.g
            }, ${borderColor.b}, ${borderColor.alpha})"/></svg>`
          ),
          blend: "over",
        },
        {
          input: pngPath,
          top: Math.floor((borderCellSize - cellSize) / 2),
          left: Math.floor((borderCellSize - cellSize) / 2),
        },
      ])
      .toFile(borderPngPath);

    pngPaths.push({ regular: pngPath, border: borderPngPath });
  }

  // Calculate grid dimensions
  const gridSize = Math.ceil(Math.sqrt(pngPaths.length));
  const outputSize =
    gridSize * borderCellSize + (gridSize - 1) * cellGap + 2 * padding;

  // Create the grid canvas for the final output
  const gridCanvas = sharp({
    create: {
      width: outputSize,
      height: outputSize,
      channels: 4,
      background: backgroundColor,
    },
  });

  // Composite the PNGs into the grid (layering border and regular icons)
  const composites = [];
  pngPaths.forEach(({ regular, border }, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;

    const x = padding + col * (borderCellSize + cellGap);
    const y = padding + row * (borderCellSize + cellGap);

    // Add the border icon first
    composites.push({ input: border, left: x, top: y });

    // Overlay the regular icon on top
    composites.push({
      input: regular,
      left: x + Math.floor((borderCellSize - cellSize) / 2),
      top: y + Math.floor((borderCellSize - cellSize) / 2),
    });
  });

  // Save the final grid image
  await gridCanvas.composite(composites).toFile(outputFileName);

  console.log(`Grid image with borders saved as ${outputFileName}`);

  // Cleanup temporary files
  pngPaths.forEach(({ regular, border }) => {
    fs.unlinkSync(regular);
    fs.unlinkSync(regular.replace(/\.png$/, ".svg"));
    fs.unlinkSync(border);
  });
  fs.rmdirSync(tempDir);
})();
