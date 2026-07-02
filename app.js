const CM_TO_POINTS = 72 / 2.54;
const LETTER_WIDTH_POINTS = 8.5 * 72;
const LETTER_HEIGHT_POINTS = 11 * 72;
const JPEG_QUALITY = 0.95;
const LANGUAGE_STORAGE_KEY = "idPdfGeneratorLanguage";

const TRANSLATIONS = {
  es: {
    "document.title": "Generador de PDF 150% para documentos",
    "language.label": "Idioma",
    "hero.eyebrow": "Herramienta PDF en el navegador",
    "hero.title": "Genera un PDF tamaño carta con ambos lados de un documento.",
    "hero.copy":
      'Sube dos imágenes escaneadas. El archivo con "Frente", "Front" o "Anverso" en el nombre se coloca arriba, cada lado se imprime a 12.9 x 8.1 cm por defecto, y todo se procesa en este navegador.',
    "drop.title": "Arrastra dos imágenes aquí",
    "drop.copy":
      "o haz clic para elegir archivos PNG, JPG u otros formatos compatibles con tu navegador.",
    "preview.topLabel": "Imagen superior",
    "preview.bottomLabel": "Imagen inferior",
    "preview.empty": "Sin imagen seleccionada",
    "preview.topAlt": "Vista previa del lado superior del documento",
    "preview.bottomAlt": "Vista previa del lado inferior del documento",
    "preview.waitingTop": "Esperando imagen frontal",
    "preview.waitingBottom": "Esperando imagen posterior",
    "settings.width": "Ancho",
    "settings.height": "Alto",
    "settings.gap": "Separación",
    "buttons.generate": "Generar PDF",
    "buttons.generating": "Generando...",
    "buttons.swap": "Cambiar orden",
    "buttons.clear": "Limpiar",
    "buttons.download": "Descargar PDF",
    "status.initial": "Elige dos imágenes para comenzar.",
    "status.twoImages": "Elige exactamente dos archivos de imagen.",
    "status.ready": "Imágenes listas. Genera el PDF cuando el orden sea correcto.",
    "status.generating": "Generando PDF...",
    "status.readyPdf":
      "PDF listo. Si la descarga no empezó automáticamente, usa el enlace Descargar PDF.",
    "status.orderSwapped": "Orden cambiado.",
    "error.loadImage": "No se pudo cargar {fileName}.",
    "error.prepareImage": "No se pudo preparar una de las imágenes.",
    "error.positiveNumber": "{label} debe ser un número positivo.",
    "error.sizeRequired": "Ancho y alto deben ser mayores que cero.",
    "error.pageFit": "Esas dimensiones no caben en una página tamaño carta.",
    "error.chooseTwo": "Elige exactamente dos imágenes primero.",
  },
  en: {
    "document.title": "ID 150% PDF Generator",
    "language.label": "Language",
    "hero.eyebrow": "Client-side PDF tool",
    "hero.title": "Generate a clean letter-size PDF from both sides of an ID.",
    "hero.copy":
      'Upload two scanned images. The file with "Frente", "Front", or "Anverso" in its name is placed on top, each side prints at 12.9 x 8.1 cm by default, and everything stays in this browser.',
    "drop.title": "Drop two images here",
    "drop.copy":
      "or click to browse for PNG, JPG, or other browser-supported image files.",
    "preview.topLabel": "Top image",
    "preview.bottomLabel": "Bottom image",
    "preview.empty": "No image selected",
    "preview.topAlt": "Top ID side preview",
    "preview.bottomAlt": "Bottom ID side preview",
    "preview.waitingTop": "Waiting for front image",
    "preview.waitingBottom": "Waiting for back image",
    "settings.width": "Width",
    "settings.height": "Height",
    "settings.gap": "Gap",
    "buttons.generate": "Generate PDF",
    "buttons.generating": "Generating...",
    "buttons.swap": "Swap order",
    "buttons.clear": "Clear",
    "buttons.download": "Download PDF",
    "status.initial": "Choose two images to begin.",
    "status.twoImages": "Please choose exactly two image files.",
    "status.ready": "Images ready. Generate the PDF when you are happy with the order.",
    "status.generating": "Generating PDF...",
    "status.readyPdf":
      "PDF ready. If the download did not start, use the Download PDF link.",
    "status.orderSwapped": "Order swapped.",
    "error.loadImage": "Could not load {fileName}.",
    "error.prepareImage": "Could not prepare one of the images.",
    "error.positiveNumber": "{label} must be a positive number.",
    "error.sizeRequired": "Width and height must be greater than zero.",
    "error.pageFit": "Those dimensions do not fit on a letter-size page.",
    "error.chooseTwo": "Choose exactly two images first.",
  },
};

const state = {
  images: [],
  language: getInitialLanguage(),
  pdfUrl: null,
  status: {
    key: "status.initial",
    values: {},
    isError: false,
  },
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
  languageSelect: document.querySelector("#languageSelect"),
  topCard: document.querySelector("#topCard"),
  bottomCard: document.querySelector("#bottomCard"),
  topName: document.querySelector("#topName"),
  bottomName: document.querySelector("#bottomName"),
  topSize: document.querySelector("#topSize"),
  bottomSize: document.querySelector("#bottomSize"),
};

function getInitialLanguage() {
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (storedLanguage && TRANSLATIONS[storedLanguage]) {
    return storedLanguage;
  }

  return "es";
}

function t(key, values = {}) {
  const translation = TRANSLATIONS[state.language][key] || TRANSLATIONS.es[key] || key;
  return translation.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.title = t("document.title");
  elements.languageSelect.value = state.language;
  elements.languageSelect.setAttribute("aria-label", t("language.label"));

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
    element.setAttribute("alt", t(element.dataset.i18nAlt));
  });

  renderStatus();
  render();
}

function renderStatus() {
  elements.status.textContent = state.status.key
    ? t(state.status.key, state.status.values)
    : state.status.message;
  elements.status.classList.toggle("error", state.status.isError);
}

function setStatus(key, isError = false, values = {}) {
  state.status = { key, values, isError };
  renderStatus();
}

function setStatusMessage(message, isError = false) {
  state.status = { key: null, message, isError };
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
  setStatus("status.initial");
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
      reject(new Error(t("error.loadImage", { fileName: file.name })));
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
    setStatus("status.twoImages", true);
    return;
  }

  try {
    for (const image of state.images) {
      URL.revokeObjectURL(image.url);
    }
    state.images = sortFrontFirst(await Promise.all(files.map(loadImageFile)));
    setStatus("status.ready");
    render();
  } catch (error) {
    setStatusMessage(error.message, true);
  }
}

function renderPreview(card, nameElement, sizeElement, image) {
  const previewImage = card.querySelector("img");
  card.classList.toggle("has-image", Boolean(image));

  if (!image) {
    previewImage.removeAttribute("src");
    nameElement.textContent = card === elements.topCard
      ? t("preview.waitingTop")
      : t("preview.waitingBottom");
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
    throw new Error(t("error.positiveNumber", { label }));
  }
  return value;
}

function getLayoutSettings() {
  const widthCm = parsePositiveNumber(elements.widthCm, t("settings.width"));
  const heightCm = parsePositiveNumber(elements.heightCm, t("settings.height"));
  const gapCm = parsePositiveNumber(elements.gapCm, t("settings.gap"));

  if (widthCm <= 0 || heightCm <= 0) {
    throw new Error(t("error.sizeRequired"));
  }

  const imageWidth = widthCm * CM_TO_POINTS;
  const imageHeight = heightCm * CM_TO_POINTS;
  const gap = gapCm * CM_TO_POINTS;

  if (imageWidth > LETTER_WIDTH_POINTS || imageHeight * 2 + gap > LETTER_HEIGHT_POINTS) {
    throw new Error(t("error.pageFit"));
  }

  return { imageWidth, imageHeight, gap };
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("error.prepareImage")));
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
    setStatus("error.chooseTwo", true);
    return;
  }

  clearPdfUrl();
  elements.generateButton.disabled = true;
  elements.generateButton.textContent = t("buttons.generating");
  setStatus("status.generating");

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
    setStatus("status.readyPdf");
  } catch (error) {
    setStatusMessage(error.message, true);
  } finally {
    elements.generateButton.textContent = t("buttons.generate");
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
  setStatus("status.orderSwapped");
  render();
});

elements.clearButton.addEventListener("click", clearImages);
elements.generateButton.addEventListener("click", generatePdf);
elements.languageSelect.addEventListener("change", (event) => {
  state.language = event.target.value;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
  applyTranslations();
});

window.addEventListener("beforeunload", () => {
  clearPdfUrl();
  for (const image of state.images) {
    URL.revokeObjectURL(image.url);
  }
});

applyTranslations();
