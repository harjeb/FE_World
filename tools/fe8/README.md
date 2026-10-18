# FE8 第8章数据提取工具

已实测从本地日版 GBA ROM 直接提取第8章。当前提供两个入口：`extract_rom.py` 直接读取 ROM，`extract_ch08.py` 提取固定版本的公开反编译数据。

## 直接读取本地 ROM

```sh
python tools/fe8/extract_rom.py "火焰纹章系列/3火焰纹章_圣魔之光石.gba" --compare design/classic-maps/extracted/fe8-ch08/chapter.json
```

直接解析入口无需网络，预览依赖 Pillow；可省略 `--compare`。它读取游戏码选择 FE8J/FE8U 的指针位置配置，再从 ROM 解引用章节、素材、职业及事件表。已以游戏码 `BE8J`、SHA-1 `56f3d3938ec0f61d3864c95c142b03c98225fe72` 的实际文件完成验证；FE8U 的直接读取配置尚未以真实美版文件验证。当前章节角色和预览适配仅支持第8章（章节表索引9）。

默认输出到 `design/classic-maps/extracted/fe8j-ch08-rom/`（日版），可通过 `--out PATH` 更换目录。数字字段来自 ROM，`formats.json` 中的公开头文件常量仅用于提供符号名称；`--compare` 为导出后独立核对，不提供提取输入。

实际结果：576格地形、6个地点事件、45条主要单位模板、3组额外过场/条件模板、7组地图变化，以及22段脚本的245条指令。读取和重复运行均未修改输入 ROM。事件指令解码不执行游戏状态、随机数或ASM，不能当作完整运行时模拟。

[真实 ROM 产物与版本差异](../../design/classic-maps/extracted/fe8j-ch08-rom/README.md)包含具体地址、校验值和预览。

## 公开数据入口

从 FE8 美版公开反编译仓库读取地图与关卡定义，导出结构化数据和可独立打开的预览页。当前只支持第8章，不是通用 GBA/NDS 提取器，也不执行游戏事件引擎。

## 运行

依赖 Python 3.10+、`requests`、`Pillow`：

```sh
python -m pip install requests Pillow
python tools/fe8/extract_ch08.py
```

第一次运行下载 `sources.lock.json` 指定的29个文件，校验大小与 SHA-256，缓存到本目录 `.cache/`。缓存不进 Git。后续可离线重跑：

```sh
python tools/fe8/extract_ch08.py --offline
python -m unittest discover -s tools/fe8 -p 'test_*.py' -v
```

默认输出到 `design/classic-maps/extracted/fe8-ch08/`。可用 `--cache PATH`、`--out PATH` 更换目录。打开输出中的 `preview.html` 即可查看，不需要启动服务。

## 数据与来源

固定上游：[FireEmblemUniverse/fireemblem8u](https://github.com/FireEmblemUniverse/fireemblem8u/tree/f2e1f060dbe5b0cc35285df5a0f6659860644a04)，提交 `f2e1f060dbe5b0cc35285df5a0f6659860644a04`。

提取了576格基础地形、10种基础地形编号、6个地点事件、5组共45条单位模板、7组地图变化，以及回合、交谈、区域事件定义。地形目录另含宝箱开启后使用的第11种类型 `TERRAIN_CHEST_EMPTY`。逐项 SHA-256 与来源链接写入输出 `sources.json`。

所有坐标为左上角起始、零基 `(x,y)`。显示章节8对应原作章节表索引9，因为表中另有5x章。

- `Ch8Map.mar` 是24×24个小端16位值。构建脚本先将 MAR 值右移3位，地形查询再右移2位，因此图块索引为 `MAR值 >> 5`，不能直接把 MAR 值当作地形编号。
- `TileConfiguration3.bin` 前 `0x2000` 字节是图块配置，后 `0x400` 字节为地形查询表。逐格查询 `config[0x2000 + 图块索引]`。
- 单位的 `entryPosition` 是入场坐标，`finalPosition` 是 REDA 移动路径终点。我方出击模板不等于玩家存档中的固定阵容。
- 地图变化中的0字按 `ApplyMapChangesById` 的实现跳过。导出为 `null`，表示保留原格，不能当作地形0写入。
- 原始事件宏及选定脚本保留在 JSON 中；中文 `eventInterpretation` 是核对后的解读，不是事件执行轨迹。

## 可选美版 ROM 与公开数据核对

```sh
python tools/fe8/extract_ch08.py --verify-rom "D:/games/fe8-us.gba" --out "D:/temp/fe8-ch08-verified"
```

仅接受游戏码 `BE8E` 且 SHA-1 为 `c25b145e37456171ada4b0d440bf88a19f4d509f` 的 FE8U 文件。其他区域、翻译版或改版需要独立配置。

此选项从 ROM 解引用章节表和素材表，解压 GBA LZ77 地图与地形配置，并核对576个图块、9216字节的地形配置，以及45条单位模板中的身份、职业、阵营、等级、坐标、物品和掉落标志。它不核对事件字节码。该美版比对入口尚未以真实美版 ROM 完成验证；已验证的日版文件请使用上面的 `extract_rom.py` 直接解析入口。

## 验证范围

25项 Python 检查覆盖地图位移、地形查表、单位位域与 REDA、LZ77 重叠拷贝及非法输入、指针越界、来源校验、关键章节事实、真实 ROM 读取及版本差异、事件指令的前向分支和嵌套条件加载。缺少本地 ROM 或来源缓存时，对应的样本检查会跳过。另以 Chromium 打开预览页，检查单位身份、真实等级、首领、门/宝箱变化、0值掩码、区域开关、手机宽度布局及 JavaScript 错误。

[样例说明与产物](../../design/classic-maps/extracted/fe8-ch08/README.md)记录了已确认的坐标和接入本项目的剩余事项。
