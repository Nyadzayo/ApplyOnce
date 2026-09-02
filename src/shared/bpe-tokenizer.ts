// Byte-level BPE tokenizer (GPT-2 / GPT-NeoX / OLMo family) for the on-device
// intent classifier (PLAN.md Part 9 §4). Reads the exact tokenizer.json the
// model was trained with. Ids must match the training tokenizer bit for bit,
// so nothing here is "close enough": NFC normalization, the GPT-2
// pre-tokenization regex, the byte-to-unicode table, rank-ordered merges and
// the [CLS] ... [SEP] template are all reproduced from the file's own fields.
// Pure TS, no dependencies.

export interface TokenizerFile {
  model: {
    type: string;
    vocab: Record<string, number>;
    merges: (string | [string, string])[];
    unk_token?: string | null;
  };
  added_tokens?: { id: number; content: string; special?: boolean }[];
  truncation?: { max_length?: number } | null;
  post_processor?: unknown;
}

const PRETOKENIZE_RE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2's bytes-to-printable-unicode table. */
function bytesToUnicode(): string[] {
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const table: string[] = new Array<string>(256);
  bs.forEach((b, i) => {
    table[b] = String.fromCharCode(cs[i]!);
  });
  return table;
}

export class BpeTokenizer {
  private readonly vocab = new Map<string, number>();
  private readonly ranks = new Map<string, number>();
  private readonly byteTable = bytesToUnicode();
  private readonly cache = new Map<string, number[]>();
  private readonly encoder = new TextEncoder();
  readonly clsId: number;
  readonly sepId: number;
  readonly padId: number;
  readonly unkId: number | undefined;
  readonly maxLength: number;

  constructor(file: TokenizerFile) {
    if (file.model.type !== "BPE") throw new Error(`unsupported tokenizer model: ${file.model.type}`);
    for (const [tok, id] of Object.entries(file.model.vocab)) this.vocab.set(tok, id);
    file.model.merges.forEach((m, i) => {
      const [a, b] = typeof m === "string" ? (m.split(" ") as [string, string]) : m;
      this.ranks.set(`${a} ${b}`, i);
    });
    const added = new Map<string, number>();
    for (const t of file.added_tokens ?? []) {
      added.set(t.content, t.id);
      if (!this.vocab.has(t.content)) this.vocab.set(t.content, t.id);
    }
    const special = (name: string) => {
      const id = added.get(name) ?? this.vocab.get(name);
      if (id === undefined) throw new Error(`tokenizer has no ${name}`);
      return id;
    };
    this.clsId = special("[CLS]");
    this.sepId = special("[SEP]");
    this.padId = special("[PAD]");
    this.unkId = file.model.unk_token ? this.vocab.get(file.model.unk_token) : undefined;
    this.maxLength = file.truncation?.max_length ?? 128;
  }

  private bpe(word: string): string[] {
    let symbols = [...word];
    while (symbols.length > 1) {
      let best: { rank: number; index: number } | undefined;
      for (let i = 0; i < symbols.length - 1; i++) {
        const rank = this.ranks.get(`${symbols[i]} ${symbols[i + 1]}`);
        if (rank !== undefined && (!best || rank < best.rank)) best = { rank, index: i };
      }
      if (!best) break;
      const merged = symbols[best.index]! + symbols[best.index + 1]!;
      const next: string[] = [];
      for (let i = 0; i < symbols.length; i++) {
        if (i === best.index) {
          next.push(merged);
          i++;
        } else next.push(symbols[i]!);
      }
      symbols = next;
    }
    return symbols;
  }

  /** Token ids of the raw text, without special tokens. */
  tokenize(text: string): number[] {
    const ids: number[] = [];
    for (const piece of text.normalize("NFC").match(PRETOKENIZE_RE) ?? []) {
      let cached = this.cache.get(piece);
      if (!cached) {
        let mapped = "";
        for (const byte of this.encoder.encode(piece)) mapped += this.byteTable[byte];
        cached = this.bpe(mapped).map((tok) => this.vocab.get(tok) ?? this.unkId ?? 0);
        this.cache.set(piece, cached);
      }
      ids.push(...cached);
    }
    return ids;
  }

  /** [CLS] text [SEP], truncated to the model's max length. */
  encode(text: string): number[] {
    const body = this.tokenize(text).slice(0, this.maxLength - 2);
    return [this.clsId, ...body, this.sepId];
  }
}
