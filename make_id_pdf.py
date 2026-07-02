#!/usr/bin/env python3
"""Create a letter-size PDF with two ID-side images enlarged to print size."""

from __future__ import annotations

import argparse
import dataclasses
import struct
import zlib
from pathlib import Path


CM_TO_POINTS = 72 / 2.54
LETTER_WIDTH_POINTS = 8.5 * 72
LETTER_HEIGHT_POINTS = 11 * 72


@dataclasses.dataclass
class PdfImage:
    width: int
    height: int
    color_space: str
    data: bytes
    filter_name: str
    alpha: bytes | None = None


def cm_to_points(value: float) -> float:
    return value * CM_TO_POINTS


def paeth_predictor(left: int, above: int, upper_left: int) -> int:
    p = left + above - upper_left
    pa = abs(p - left)
    pb = abs(p - above)
    pc = abs(p - upper_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return above
    return upper_left


def parse_png(path: Path) -> PdfImage:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG file")

    offset = 8
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()

    while offset < len(raw):
        chunk_length = struct.unpack(">I", raw[offset : offset + 4])[0]
        chunk_type = raw[offset + 4 : offset + 8]
        chunk_data = raw[offset + 8 : offset + 8 + chunk_length]
        offset += 12 + chunk_length

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(
                ">IIBBBBB", chunk_data
            )
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if None in (width, height, bit_depth, color_type, interlace):
        raise ValueError(f"{path} is missing required PNG metadata")
    if bit_depth != 8:
        raise ValueError(f"{path} uses unsupported PNG bit depth {bit_depth}; expected 8")
    if interlace != 0:
        raise ValueError(f"{path} uses unsupported interlacing")

    channels_by_color_type = {
        0: (1, "/DeviceGray"),
        2: (3, "/DeviceRGB"),
        6: (4, "/DeviceRGB"),
    }
    if color_type not in channels_by_color_type:
        raise ValueError(
            f"{path} uses unsupported PNG color type {color_type}; use RGB or RGBA PNGs"
        )

    channels, color_space = channels_by_color_type[color_type]
    bytes_per_pixel = channels
    row_length = width * channels
    decompressed = zlib.decompress(bytes(compressed))
    expected_length = (row_length + 1) * height
    if len(decompressed) != expected_length:
        raise ValueError(f"{path} has unexpected decoded PNG data length")

    rows: list[bytes] = []
    previous = bytes(row_length)
    cursor = 0

    for _ in range(height):
        filter_type = decompressed[cursor]
        cursor += 1
        scanline = decompressed[cursor : cursor + row_length]
        cursor += row_length
        reconstructed = bytearray(row_length)

        for i, byte in enumerate(scanline):
            left = reconstructed[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
            above = previous[i]
            upper_left = previous[i - bytes_per_pixel] if i >= bytes_per_pixel else 0

            if filter_type == 0:
                value = byte
            elif filter_type == 1:
                value = byte + left
            elif filter_type == 2:
                value = byte + above
            elif filter_type == 3:
                value = byte + ((left + above) // 2)
            elif filter_type == 4:
                value = byte + paeth_predictor(left, above, upper_left)
            else:
                raise ValueError(f"{path} uses unknown PNG filter {filter_type}")

            reconstructed[i] = value & 0xFF

        rows.append(bytes(reconstructed))
        previous = bytes(reconstructed)

    pixels = b"".join(rows)
    if color_type == 6:
        rgb = bytearray(width * height * 3)
        alpha = bytearray(width * height)
        for source_index in range(width * height):
            rgba_start = source_index * 4
            rgb_start = source_index * 3
            rgb[rgb_start : rgb_start + 3] = pixels[rgba_start : rgba_start + 3]
            alpha[source_index] = pixels[rgba_start + 3]
        alpha_bytes = bytes(alpha)
        return PdfImage(
            width=width,
            height=height,
            color_space=color_space,
            data=zlib.compress(bytes(rgb), level=9),
            filter_name="/FlateDecode",
            alpha=None if all(value == 255 for value in alpha_bytes) else zlib.compress(alpha_bytes, level=9),
        )

    return PdfImage(
        width=width,
        height=height,
        color_space=color_space,
        data=zlib.compress(pixels, level=9),
        filter_name="/FlateDecode",
    )


def parse_jpeg_dimensions(data: bytes, path: Path) -> tuple[int, int]:
    if not data.startswith(b"\xff\xd8"):
        raise ValueError(f"{path} is not a JPEG file")

    offset = 2
    while offset < len(data):
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9}:
            continue
        segment_length = struct.unpack(">H", data[offset : offset + 2])[0]
        if 0xC0 <= marker <= 0xCF and marker not in {0xC4, 0xC8, 0xCC}:
            height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
            return width, height
        offset += segment_length

    raise ValueError(f"{path} is missing JPEG dimensions")


def parse_jpeg(path: Path) -> PdfImage:
    data = path.read_bytes()
    width, height = parse_jpeg_dimensions(data, path)
    return PdfImage(
        width=width,
        height=height,
        color_space="/DeviceRGB",
        data=data,
        filter_name="/DCTDecode",
    )


def load_image(path: Path) -> PdfImage:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return parse_png(path)
    if suffix in {".jpg", ".jpeg"}:
        return parse_jpeg(path)
    raise ValueError(f"{path} is unsupported; use PNG or JPEG images")


class PdfWriter:
    def __init__(self) -> None:
        self.objects: list[bytes] = []

    def add(self, body: bytes) -> int:
        self.objects.append(body)
        return len(self.objects)

    def build(self, root_object: int) -> bytes:
        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, body in enumerate(self.objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("ascii"))
            output.extend(body)
            output.extend(b"\nendobj\n")

        xref_offset = len(output)
        output.extend(f"xref\n0 {len(self.objects) + 1}\n".encode("ascii"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        output.extend(
            (
                f"trailer\n<< /Size {len(self.objects) + 1} /Root {root_object} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF\n"
            ).encode("ascii")
        )
        return bytes(output)


def add_image_object(writer: PdfWriter, image: PdfImage) -> int:
    smask_reference = ""
    if image.alpha is not None:
        alpha_object = writer.add(
            (
                f"<< /Type /XObject /Subtype /Image /Width {image.width} "
                f"/Height {image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 "
                f"/Filter /FlateDecode /Length {len(image.alpha)} >>\nstream\n"
            ).encode("ascii")
            + image.alpha
            + b"\nendstream"
        )
        smask_reference = f"/SMask {alpha_object} 0 R "

    return writer.add(
        (
            f"<< /Type /XObject /Subtype /Image /Width {image.width} "
            f"/Height {image.height} /ColorSpace {image.color_space} /BitsPerComponent 8 "
            f"/Filter {image.filter_name} {smask_reference}/Length {len(image.data)} >>\n"
            f"stream\n"
        ).encode("ascii")
        + image.data
        + b"\nendstream"
    )


def sort_front_first(paths: list[Path]) -> list[Path]:
    def order(path: Path) -> tuple[int, str]:
        lower_name = path.name.lower()
        if "frente" in lower_name or "front" in lower_name:
            return (0, lower_name)
        if "reverso" in lower_name or "back" in lower_name:
            return (1, lower_name)
        return (2, lower_name)

    return sorted(paths, key=order)


def create_pdf(
    image_paths: list[Path],
    output_path: Path,
    image_width_cm: float,
    image_height_cm: float,
    gap_cm: float,
) -> None:
    if len(image_paths) != 2:
        raise ValueError("Exactly two images are required")

    writer = PdfWriter()
    image_objects = [add_image_object(writer, load_image(path)) for path in image_paths]

    image_width = cm_to_points(image_width_cm)
    image_height = cm_to_points(image_height_cm)
    gap = cm_to_points(gap_cm)
    group_height = (image_height * 2) + gap
    x = (LETTER_WIDTH_POINTS - image_width) / 2
    bottom_y = (LETTER_HEIGHT_POINTS - group_height) / 2
    positions = [
        (x, bottom_y + image_height + gap),
        (x, bottom_y),
    ]

    content_lines = []
    for index, (image_object, (image_x, image_y)) in enumerate(
        zip(image_objects, positions), start=1
    ):
        content_lines.append(
            f"q\n{image_width:.4f} 0 0 {image_height:.4f} {image_x:.4f} {image_y:.4f} cm\n/Im{index} Do\nQ\n"
        )
    content = "".join(content_lines).encode("ascii")
    content_object = writer.add(
        f"<< /Length {len(content)} >>\nstream\n".encode("ascii")
        + content
        + b"endstream"
    )
    xobject_entries = " ".join(
        f"/Im{index} {object_number} 0 R"
        for index, object_number in enumerate(image_objects, start=1)
    )
    page_object = writer.add(
        (
            f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {LETTER_WIDTH_POINTS:.0f} {LETTER_HEIGHT_POINTS:.0f}] "
            f"/Resources << /XObject << {xobject_entries} >> >> "
            f"/Contents {content_object} 0 R >>"
        ).encode("ascii")
    )
    pages_object = writer.add(
        f"<< /Type /Pages /Kids [{page_object} 0 R] /Count 1 >>".encode("ascii")
    )
    writer.objects[page_object - 1] = writer.objects[page_object - 1].replace(
        b"/Parent 0 0 R", f"/Parent {pages_object} 0 R".encode("ascii")
    )
    catalog_object = writer.add(
        f"<< /Type /Catalog /Pages {pages_object} 0 R >>".encode("ascii")
    )

    output_path.write_bytes(writer.build(catalog_object))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a letter-size PDF with two ID images at 150% scale."
    )
    parser.add_argument("images", nargs=2, type=Path, help="Two PNG/JPEG image paths")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("id_150_percent.pdf"),
        help="Output PDF path",
    )
    parser.add_argument(
        "--width-cm",
        type=float,
        default=12.9,
        help="Printed width of each image in centimeters",
    )
    parser.add_argument(
        "--height-cm",
        type=float,
        default=8.1,
        help="Printed height of each image in centimeters",
    )
    parser.add_argument(
        "--gap-cm",
        type=float,
        default=1.0,
        help="Vertical gap between images in centimeters",
    )
    parser.add_argument(
        "--keep-order",
        action="store_true",
        help="Use argument order instead of placing Frente/front before Reverso/back",
    )
    args = parser.parse_args()

    image_paths = args.images if args.keep_order else sort_front_first(args.images)
    create_pdf(
        image_paths=image_paths,
        output_path=args.output,
        image_width_cm=args.width_cm,
        image_height_cm=args.height_cm,
        gap_cm=args.gap_cm,
    )
    ordered_names = ", ".join(path.name for path in image_paths)
    print(f"Created {args.output} with images in this order: {ordered_names}")


if __name__ == "__main__":
    main()
