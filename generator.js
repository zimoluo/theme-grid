const puppeteer = require("puppeteer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { optimize } = require("svgo");

(async () => {
  const url = "https://www.zimoluo.me/design";
  const cellSize = 512; // Default cell size for the smaller icons
  const borderCellSize = 580; // Size for the larger background circles
  const cellGap = 256; // Default gap size
  const padding = cellGap; // Padding equal to gap size
  const borderColor = { r: 180, g: 180, b: 180, alpha: 0.8 }; // Border color for the larger circle
  const isPng = false; // Toggle to render PNG or SVG
  const outputFileName = isPng
    ? "output_grid_with_border.png"
    : "output_grid_with_border.svg";

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

  // Directory to store downloaded SVGs
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  // Download and process SVGs
  const svgDataList = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];

    // Fetch SVG content
    const response = await fetch(url);
    const svgContent = await response.text();

    // Parse viewBox and other properties
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch
      ? viewBoxMatch[1].split(" ").map(Number)
      : [0, 0, cellSize, cellSize];
    const uniquePrefix = `img${i}-`;

    // Add a unique prefix to IDs and update references
    const updatedSvgContent = svgContent
      .replace(/\bid="([^"]+)"/g, (match, id) => `id="${uniquePrefix}${id}"`)
      .replace(
        /\burl\(#([^"]+)\)/g,
        (match, id) => `url(#${uniquePrefix}${id})`
      )
      .replace(
        /\bxlink:href="#([^"]+)"/g,
        (match, id) => `xlink:href="#${uniquePrefix}${id}"`
      );

    svgDataList.push({ content: updatedSvgContent, viewBox, uniquePrefix });
  }

  // Calculate grid dimensions
  const gridSize = Math.ceil(Math.sqrt(svgDataList.length));
  const canvasSize =
    gridSize * borderCellSize + (gridSize - 1) * cellGap + 2 * padding;

  // Start creating the output SVG
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">`;

  // Add background color
  svgContent += `<defs><clipPath id="grid-clip"><rect width="${canvasSize}" height="${canvasSize}" fill="#fff" /></clipPath></defs><g clip-path="url(#grid-clip)"><rect width="${canvasSize}" height="${canvasSize}" fill="rgba(240, 240, 240, 1)" />`;

  // Place each SVG on the grid
  for (let i = 0; i < svgDataList.length; i++) {
    const { content, viewBox, uniquePrefix } = svgDataList[i];
    const [vbX, vbY, vbWidth, vbHeight] = viewBox;

    const row = Math.floor(i / gridSize);
    const col = i % gridSize;

    const x = padding + col * (borderCellSize + cellGap);
    const y = padding + row * (borderCellSize + cellGap);

    // Calculate scaling
    const scaleX = cellSize / vbWidth;
    const scaleY = cellSize / vbHeight;
    const scale = Math.min(scaleX, scaleY);
    const inverseScale = 1 / scale;

    const translateX = -vbX * scale + (cellSize - vbWidth * scale) / 2;
    const translateY = -vbY * scale + (cellSize - vbHeight * scale) / 2;

    // Define the clip path for this SVG
    svgContent += `
      <defs>
        <clipPath id="${uniquePrefix}clip">
          <circle cx="${cellSize / 2}" cy="${cellSize / 2}" r="${
      cellSize / 2
    }" transform="scale(${inverseScale})" />
        </clipPath>
      </defs>`;

    // Add the larger circular background
    svgContent += `<circle cx="${x + borderCellSize / 2}" cy="${
      y + borderCellSize / 2
    }" r="${borderCellSize / 2}" fill="rgba(${borderColor.r}, ${
      borderColor.g
    }, ${borderColor.b}, ${borderColor.alpha})" />`;

    // Embed the SVG content with clipping applied
    svgContent += `<g transform="translate(${
      x + (borderCellSize - cellSize) / 2
    }, ${
      y + (borderCellSize - cellSize) / 2
    }) scale(${scale}) translate(${translateX}, ${translateY})" clip-path="url(#${uniquePrefix}clip)">
      ${content
        .replace(/<\?xml[^>]*>/, "") // Remove XML declaration
        .replace(/<!DOCTYPE[^>]*>/, "") // Remove DOCTYPE
        .replace(/<svg[^>]*>/, "") // Remove opening SVG tag
        .replace(/<\/svg>/, "")}
    </g>`;
  }

  // Close the SVG
  svgContent += `</g></svg>`;

  // Optimize SVG with SVGO
  const optimizedSvg = optimize(svgContent, {
    plugins: [
      {
        name: "preset-default",
        params: { overrides: { removeViewBox: false } },
      },
    ],
  }).data;

  if (!isPng) {
    // Save the optimized SVG
    fs.writeFileSync(outputFileName, optimizedSvg);
    console.log(`Optimized SVG saved as ${outputFileName}`);
  } else {
    // Use Sharp to render the optimized SVG to PNG
    await sharp(Buffer.from(optimizedSvg)).png().toFile(outputFileName);

    console.log(`Rendered PNG saved as ${outputFileName}`);
  }

  // Cleanup temporary files
  fs.rmSync(tempDir, { recursive: true });
})();
