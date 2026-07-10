// jsdom gaps: DataTransfer doesn't exist. Minimal polyfill so the filler's
// file-attach path is testable. (CSS.escape is handled in src via cssEscape.)

class FakeDataTransferItemList {
  private files: File[] = [];
  add(file: File): void {
    this.files.push(file);
  }
  getFiles(): File[] {
    return this.files;
  }
}

class FakeDataTransfer {
  items = new FakeDataTransferItemList();
  get files(): FileList {
    const arr = this.items.getFiles();
    const list: Record<number | string, unknown> = {
      length: arr.length,
      item: (i: number) => arr[i] ?? null,
      [Symbol.iterator]: function* () {
        yield* arr;
      },
    };
    arr.forEach((f, i) => {
      list[i] = f;
    });
    return list as unknown as FileList;
  }
}

if (typeof globalThis.DataTransfer === "undefined") {
  (globalThis as Record<string, unknown>).DataTransfer = FakeDataTransfer;
}
if (typeof globalThis.DragEvent === "undefined") {
  (globalThis as Record<string, unknown>).DragEvent = class extends Event {
    dataTransfer: unknown = null;
  };
}
