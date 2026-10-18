# FC/SFC 逆向笔记

## FE3 纹章之谜（SFC，LoROM，本机 SHA-1 c0a9e728…）

- 章节表 63×8 字节 @ 0x50000；`CHAPTERS_ID` @ 0x20C15（章节表索引→章节ID）。
- 地图指针表 @ 0x4CAB1，3字节/项，值 = 24位偏移；文件 = 0x120000 + (v - 0x8000)，共33块。
- 地图块为自定义压缩（命令高3位、长度低5位、0xFF结束），解压后 32×32×2字节图块索引。
- 地形属性指针表 @ 0x501F8，3字节/项（低、高、bank），每项1024字节；
  地形 = 属性[图块索引 & 0x3FF] & 0x1F。
- 地形名表 @ 0x5F48E（26项），文本在 minirop/fe3 的 text/lists/terrain_messages.json。
- 单位表 @ 0x40000（16位指针/章），记录19字节：unit,class,level,name,x,y,mounted,portrait,w1..w4,i1..i2,money2,ai1..ai3；0xFF终止。
- 初始敌军表 @ 0x48000（16位指针，`CHAPTERS_REINFORCEMENT_ENEMY_UNITS`），按章节表索引（11–20）读取；每章10–29条。章节信息第4字节是 0x1F，不是该表索引。
- 建筑表 @ 0x6117C，10字节/项：chapter,unit,x,y,restriction,type,param2,graphics2；类型4=王座。
- 已验证：33块解压尺寸2048/2049；地形表解析；10章草案 214 敌军模板；测试 tools/fe-classic/test_fe3.py 通过。
- 未决：个别章节共享地图索引（11/17章同为27），章节信息与单位的索引仍需事件脚本核对。

## FE2 外传（FC）

- 地图格式见 minirop/fe2-tiled README：首字节 height-1、次字节 width-1；格式0/1为两种RLE，格式2原始；0/1以0xFF结束。
- 仓库自带 maps/*.tmx（108个，文件名即ROM地址），可直接解析为图块网格。
- 图块ID是图形索引，不是地形；需要移动/战斗规则表才能得到地形语义。

## FE1 暗黑龙（FC）

- 反汇编 StanHash/fe1 只覆盖部分代码；地图加载逻辑未完全标注。
- 已知：地图单元值 0..47 通过 Cell2TerrainBlue/Red（0xE828/0xE8F8）映射为地形；JobMoveCosts 按职业给出地形消耗。
- 尚未定位章节→地图数据表；普通 32×32 数组扫描无结果，可能带压缩或非标准头。

## FE5 多拉基亚（SFC）

- ZaneAvernathy/FireEmblem5 反汇编主要填充 BaseROM，地图数据未标注。
- 地形表（TerrainAvoid/Defense 等 CSV）已给出，但地图块定位未完成。

## FE4 圣战之系谱（SFC）

- 未找到公开反汇编；1/2字节、4bit、2bit 及 FE3 压缩器扫描均未发现地图数组，判断为独立压缩/分块结构。
- 仍需定位章节表或解压例程。
