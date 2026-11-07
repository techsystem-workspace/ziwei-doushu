// Chạy: npx tsx i18n-vi/runtime.test.ts
import assert from 'node:assert/strict';
import { setDicts, translate } from './runtime';

setDicts({
  glossary: { 紫微: 'Tử Vi', 化禄: 'Hóa Lộc', 化忌: 'Hóa Kỵ', 命宫: 'Cung Mệnh', 天机: 'Thiên Cơ', 命: 'Mệnh' },
  strings: { 开始排盘: 'Bắt đầu lập lá số', '大限 流年': 'Đại hạn lưu niên' },
  templates: { '{0}化忌坐{1}宫': '{0} Hóa Kỵ tọa cung {1}', '{0}入{1}': '{0} nhập {1}' },
  chars: { 年: 'niên', 好: 'hảo' },
});

const eq = (a: string, b: string) => assert.equal(translate(a), b);
eq('开始排盘', 'Bắt đầu lập lá số');                       // exact
eq('大限\n   流年', 'Đại hạn lưu niên');                    // key gộp whitespace
eq('  命宫\n', '  Cung Mệnh\n');                            // giữ khoảng trắng đầu/cuối
eq('紫微化忌坐命宫', 'Tử Vi Hóa Kỵ tọa cung Mệnh');         // template, biến dịch đệ quy
eq('紫微化禄入天机化忌坐命宫', 'Tử Vi Hóa Lộc nhập Thiên Cơ Hóa Kỵ tọa cung Mệnh'); // template lồng
eq('紫微化禄', 'Tử Vi Hóa Lộc');                            // phân đoạn longest-match
eq('2024年好', '2024 niên hảo');                             // chars.json + space với Latin
eq('紫微，天机：命宫（好）。', 'Tử Vi, Thiên Cơ: Cung Mệnh (hảo).'); // dấu câu
eq('《紫微》', '“Tử Vi”');
eq('Hello, world 2024', 'Hello, world 2024');                // không Hán → nguyên
eq('', '');
eq('鑫', '鑫');                                               // không có trong từ điển → giữ
console.log('runtime.test: OK');
