const CM_TO_POINTS = 72 / 2.54;
const LETTER_WIDTH_POINTS = 8.5 * 72;
const LETTER_HEIGHT_POINTS = 11 * 72;
const JPEG_QUALITY = 0.95;

const state = {
  images: [],
  pdfUrl: null,
};

const elements = {
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  generateButton: document.querySelector("#generateButton"),
  swapButton: document.querySelector("#swapButton"),
  clearButton: document.querySelector("#clearButton"),
  downloadLink: document.querySelector("#downloadLink"),
  status: document.querySelector("#status"),
  widthCm: document.querySelector("#widthCm"),
  heightCm: document.querySelector("#heightCm"),
  gapCm: document.querySelector("#gapCm"),
  topCard: document.querySelector("#topCard"),
  bottomCard: document.querySelector("#bottomCard"),
  topName: document.querySelector("#topName"),
  bottomName: document.querySelector("#bottomName"),
  topSize: document.querySelector("#topSize"),
  bottomSize: document.querySelector("#bottomSize"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function clearPdfUrl() {
  if (state.pdfUrl) {
    URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
  }
  elements.downloadLink.hidden = true;
  elements.downloadLink.removeAttribute("href");
}

function clearImages() {
  clearPdfUrl();
  for (const image of state.images) {
    URL.revokeObjectURL(image.url);
  }
  state.images = [];
  elements.fileInput.value = "";
  setStatus("Choose two images to begin.");
  render();
}

function imageOrderScore(fileName) {
  const name = fileName.toLowerCase();
  if (name.includes("frente") || name.includes("front") || name.includes("anverso")) {
    return 0;
  }
  if (
    name.includes("reverso") ||
    name.includes("reverse") ||
    name.includes("back") ||
    name.includes("posterior")
  ) {
    return 1;
  }
  return 2;
}

function sortFrontFirst(images) {
  return [...images].sort((first, second) => {
    const scoreDiff = imageOrderScore(first.file.name) - imageOrderScore(second.file.name);
    return scoreDiff || first.file.name.localeCompare(second.file.name);
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        file,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}.`));
    };

    image.src = url;
  });
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));

  clearPdfUrl();

  if (files.length !== 2) {
    for (const image of state.images) {
      URL.revokeObjectURL(image.url);
    }
    state.images = [];
    render();
    setStatus("Please choose exactly two image files.", true);
    return;
  }

  try {
    for (const image of state.images) {
      URL.revokeObjectURL(image.url);
    }
    state.images = sortFrontFirst(await Promise.all(files.map(loadImageFile)));
    setStatus("Images ready. Generate the PDF when you are happy with the order.");
    render();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderPreview(card, nameElement, sizeElement, image) {
  const previewImage = card.querySelector("img");
  card.classList.toggle("has-image", Boolean(image));

  if (!image) {
    previewImage.removeAttribute("src");
    nameElement.textContent = card === elements.topCard
      ? "Waiting for front image"
      : "Waiting for back image";
    sizeElement.textContent = "-";
    return;
  }

  previewImage.src = image.url;
  nameElement.textContent = image.file.name;
  sizeElement.textContent = `${image.width} x ${image.height} px`;
}

function render() {
  renderPreview(elements.topCard, elements.topName, elements.topSize, state.images[0]);
  renderPreview(elements.bottomCard, elements.bottomName, elements.bottomSize, state.images[1]);

  const hasTwoImages = state.images.length === 2;
  elements.generateButton.disabled = !hasTwoImages;
  elements.swapButton.disabled = !hasTwoImages;
  elements.clearButton.disabled = state.images.length === 0;
}

function parsePositiveNumber(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function getLayoutSettings() {
  const widthCm = parsePositiveNumber(elements.widthCm, "Width");
  const heightCm = parsePositiveNumber(elements.heightCm, "Height");
  const gapCm = parsePositiveNumber(elements.gapCm, "Gap");

  if (widthCm <= 0 || heightCm <= 0) {
    throw new Error("Width and height must be greater than zero.");
  }

  const imageWidth = widthCm * CM_TO_POINTS;
  const imageHeight = heightCm * CM_TO_POINTS;
  const gap = gapCm * CM_TO_POINTS;

  if (imageWidth > LETTER_WIDTH_POINTS || imageHeight * 2 + gap > LETTER_HEIGHT_POINTS) {
    throw new Error("Those dimensions do not fit on a letter-size page.");
  }

  return { imageWidth, imageHeight, gap };
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare one of the images."));
    image.src = url;
  });
}

async function imageToJpeg(imageState) {
  const image = await loadImageElement(imageState.url);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

  return {
    width: canvas.width,
    height: canvas.height,
    bytes: base64ToUint8Array(base64),
  };
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const encoder = new TextEncoder();

function bytesFromString(value) {
  return encoder.encode(value);
}

function concatBytes(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

class PdfWriter {
  constructor() {
    this.objects = [];
  }

  addObject(chunks) {
    this.objects.push(Array.isArray(chunks) ? chunks : [bytesFromString(chunks)]);
    return this.objects.length;
  }

  build(rootObject) {
    const chunks = [
      bytesFromString("%PDF-1.4\n%"),
      Uint8Array.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    ];
    let length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const offsets = [0];

    const push = (chunk) => {
      chunks.push(chunk);
      length += chunk.length;
    };

    this.objects.forEach((objectChunks, objectIndex) => {
      offsets.push(length);
      push(bytesFromString(`${objectIndex + 1} 0 obj\n`));
      for (const objectChunk of objectChunks) {
        push(objectChunk);
      }
      push(bytesFromString("\nendobj\n"));
    });

    const xrefOffset = length;
    push(bytesFromString(`xref\n0 ${this.objects.length + 1}\n`));
    push(bytesFromString("0000000000 65535 f \n"));

    for (const offset of offsets.slice(1)) {
      push(bytesFromString(`${String(offset).padStart(10, "0")} 00000 n \n`));
    }

    push(
      bytesFromString(
        `trailer\n<< /Size ${this.objects.length + 1} /Root ${rootObject} 0 R >>\n` +
          `startxref\n${xrefOffset}\n%%EOF\n`,
      ),
    );

    return concatBytes(chunks, length);
  }
}

function addImageObject(writer, image) {
  return writer.addObject([
    bytesFromString(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${image.bytes.length} >>\nstream\n`,
    ),
    image.bytes,
    bytesFromString("\nendstream"),
  ]);
}

function createPdf(images, layout) {
  const writer = new PdfWriter();
  const imageObjects = images.map((image) => addImageObject(writer, image));

  const groupHeight = layout.imageHeight * 2 + layout.gap;
  const x = (LETTER_WIDTH_POINTS - layout.imageWidth) / 2;
  const bottomY = (LETTER_HEIGHT_POINTS - groupHeight) / 2;
  const positions = [
    [x, bottomY + layout.imageHeight + layout.gap],
    [x, bottomY],
  ];

  const content = imageObjects
    .map((_, index) => {
      const [imageX, imageY] = positions[index];
      return (
        `q\n${layout.imageWidth.toFixed(4)} 0 0 ${layout.imageHeight.toFixed(4)} ` +
        `${imageX.toFixed(4)} ${imageY.toFixed(4)} cm\n/Im${index + 1} Do\nQ\n`
      );
    })
    .join("");

  const contentBytes = bytesFromString(content);
  const contentObject = writer.addObject([
    bytesFromString(`<< /Length ${contentBytes.length} >>\nstream\n`),
    contentBytes,
    bytesFromString("endstream"),
  ]);

  const pageObject = writer.objects.length + 1;
  const pagesObject = pageObject + 1;
  const xObjects = imageObjects
    .map((objectNumber, index) => `/Im${index + 1} ${objectNumber} 0 R`)
    .join(" ");

  writer.addObject(
    `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${LETTER_WIDTH_POINTS} ${LETTER_HEIGHT_POINTS}] ` +
      `/Resources << /XObject << ${xObjects} >> >> /Contents ${contentObject} 0 R >>`,
  );
  writer.addObject(`<< /Type /Pages /Kids [${pageObject} 0 R] /Count 1 >>`);
  const catalogObject = writer.addObject(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);

  return writer.build(catalogObject);
}

async function generatePdf() {
  if (state.images.length !== 2) {
    setStatus("Choose exactly two images first.", true);
    return;
  }

  clearPdfUrl();
  elements.generateButton.disabled = true;
  elements.generateButton.textContent = "Generating...";
  setStatus("Generating PDF...");

  try {
    const layout = getLayoutSettings();
    const pdfImages = await Promise.all(state.images.map(imageToJpeg));
    const pdfBytes = createPdf(pdfImages, layout);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    state.pdfUrl = URL.createObjectURL(blob);

    elements.downloadLink.href = state.pdfUrl;
    elements.downloadLink.download = "id_150_percent.pdf";
    elements.downloadLink.hidden = false;
    elements.downloadLink.click();
    setStatus("PDF ready. If the download did not start, use the Download PDF link.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    elements.generateButton.textContent = "Generate PDF";
    render();
  }
}

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

elements.fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("drag-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, () => {
    elements.dropZone.classList.remove("drag-over");
  });
}

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  handleFiles(event.dataTransfer.files);
});

elements.swapButton.addEventListener("click", () => {
  state.images.reverse();
  clearPdfUrl();
  setStatus("Order swapped.");
  render();
});

elements.clearButton.addEventListener("click", clearImages);
elements.generateButton.addEventListener("click", generatePdf);

window.addEventListener("beforeunload", () => {
  clearPdfUrl();
  for (const image of state.images) {
    URL.revokeObjectURL(image.url);
  }
});

render();
