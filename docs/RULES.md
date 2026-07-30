# Rules

Source: `vendor/mofa-dengxiantai/source-docs/01-rulebook.md` and `vendor/mofa-dengxiantai/cards/*.csv`.

Upstream commit: `b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`.

Rules version: upstream v0.1, faithful mode.

## Objective

Players are cultivators repairing the last Ascension Platform before the end of the era. Everyone may need to cooperate to repair the platform and resist calamities, but only qualified players with enough merit can occupy the limited ascension seats.

Win at ascension if both are true:

- your cultivation is at least 6;
- your final ranked position fits into the number of open ascension seats.

All players lose immediately if the platform receives a third crack. All players also lose if round 8 ends without ascension.

## Players And Duration

| Item | Rule |
|---|---|
| Player count | 4-6 |
| Maximum rounds | 8 |
| Recommended paper duration | 45-60 minutes |
| Recommended age | 14+ |

## Public Resources

| Resource | Range | Rule |
|---|---:|---|
| Spirit | Usually 0-6 | Public spendable resource. Used for cultivation, repair, resist, and some cards. |
| Cultivation | 0-9 | Public qualification track. At least 6 is required to ascend. |
| Merit | 0+ | Public score. Effective repair and resist contribution each award merit. |
| Cracks | 0-3 | Third crack causes collective failure. |
| Main platform progress | 0 to player-scaled requirement | Finishing the main platform opens seat 1. |
| Extra seat progress | Variable | Extra seats open in order. |

Private information:

- hand cards;
- fate card;
- unrevealed plan;
- unrevealed vote;
- temporary private card-look effects.

## Setup

1. Set cracks to 0 and round to 1.
2. Set main platform requirement:

| Players | Main requirement |
|---:|---:|
| 4 | 12 |
| 5 | 15 |
| 6 | 18 |

3. Add extra seat requirements, never exceeding player count:

| Seat opened | Extra repair required |
|---:|---:|
| 2 | 3 |
| 3 | 4 |
| 4 | 5 |
| 5 | 7 |
| 6 | 9 |

4. Shuffle calamities by stage. Draw 3 initial, 3 heavy, and 2 apocalyptic calamities, in that order.
5. Shuffle the opportunity deck.
6. Give every player a board, action set, vote set, and screen.
7. Randomize seat order. Each player's fate target is the player to their left.
8. Deal one public character to each player.
9. Deal one private fate to each player.
10. Every player starts with 0 spirit, 0 cultivation, 0 merit, and 0 hand cards.
11. Randomly choose the first calamity leader.

## Round Flow

Each round follows this exact order unless a card or calamity changes a step:

1. Reveal calamity.
2. Breath spirit.
3. Public negotiation.
4. Secret plan.
5. Simultaneous reveal.
6. Opportunity and ability window.
7. Resolve actions in this order: explore, cultivate, repair, resist.
8. Resolve lightning and cracks.
9. Vote to launch if the main platform is complete.
10. End round cleanup.

## Reveal Calamity

Reveal the current calamity and calculate the current resist demand for the active player count. Calamity text is public.

Cards with trigger `揭示天劫后` may be used at this timing in calamity-leader order.

## Breath Spirit

Each player gains 3 spirit, capped by their storage limit. Some calamities reduce this amount. Spirit is public.

Cards with breath timing resolve from the calamity leader clockwise.

## Public Negotiation

Players may discuss plans, make promises, ask for help, and lie. Promises are not rules-enforced.

Players may not:

- private chat;
- show hand cards;
- show fate cards;
- trade cards or spirit;
- hide public tracks or resources.

## Secret Plan

Each player chooses exactly one action:

| Action | Investment |
|---|---|
| Cultivate | 1-3 spirit if the player has spirit |
| Repair | 1-3 spirit if the player has spirit |
| Resist | 1-3 spirit if the player has spirit |
| Explore | 0 spirit |

Investment cannot be split across actions. Plans are locked after submission unless a card or character effect changes them.

## Simultaneous Reveal

All plans reveal together. Apply effects that trigger after reveal and before the opportunity window.

## Opportunity And Ability Window

From the calamity leader clockwise, each player chooses one:

- play one opportunity card matching its timing;
- use a matching character ability;
- pass.

Each player can actively use at most one opportunity card per round. Reaction cards also count against this limit. Character abilities do not count against the opportunity-card limit.

If equipping a treasure while already equipped, discard the old treasure first. A player can have only one treasure equipped.

Newly explored cards are exhausted until end of round and cannot be used that round.

## Action Resolution

### Explore

Each explorer draws 2 opportunity cards, keeps 1 exhausted into hand, and discards the other face up. If the deck lacks cards, shuffle discard into a new deck first.

The talisman character draws 3 and keeps 1 instead.

### Cultivate

Each invested spirit increases cultivation by 1, capped at 9. Cultivation does not award merit.

### Repair

Repair contributions fill the main platform first, then extra seats in order. Each effective player-spirit contribution awards 1 merit. Virtual repair contribution fills space but does not award merit unless a card explicitly says otherwise.

### Resist

Resist contributions reduce the current calamity demand. Each effective player-spirit contribution awards 1 merit. Virtual resist contribution reduces demand but does not award merit unless a card explicitly says otherwise.

If total resist contribution is less than demand, each missing point becomes one lightning strike.

## Effective Contribution Ordering

Use this only when player investment exceeds remaining repair space or resist demand.

1. Sort contributing players by current merit from low to high.
2. Break merit ties clockwise from the calamity leader.
3. Add one spirit from each sorted player in repeated passes.
4. Stop when the repair space or demand is filled.
5. Added player spirit is effective and awards merit.
6. Unused invested spirit is still spent and awards no merit.
7. Virtual contribution fills only after effective player spirit has been allocated.

## Lightning

Build lightning order:

1. Lower resist investment first.
2. Tie: higher cultivation first.
3. Tie: clockwise from calamity leader.

Assign strikes one at a time through that order, looping if needed.

Normal lightning cost is 2 spirit. If the victim has enough spirit, they lose that much spirit. If not, they lose all spirit and 1 cultivation. If they have 0 cultivation and cannot pay the spirit cost, the platform takes 1 crack instead.

Effects may cancel, redirect, reduce, or replace lightning. A third crack causes immediate collective failure unless a valid reaction prevents that crack before placement.

## Launch Vote

Skip this stage if the main platform is incomplete.

If the main platform is complete, players secretly vote launch or continue. Strictly more than half of all players must vote launch to ascend.

If the vote fails and no one has used force breach this game, ask players clockwise from the calamity leader. The first player who chooses force breach launches immediately if they:

- have cultivation at least 6;
- have at least 3 spirit;
- have at least 3 merit;
- pay 3 spirit and lose 3 merit.

## End Round

If the game is not over:

1. Ready all newly explored cards.
2. Discard down to hand limit 3, or 5 with the appropriate treasure.
3. Clear once-per-round flags.
4. Pass calamity leader clockwise.
5. If round 8 just ended without launch, all players lose.
6. Otherwise increment round and start the next round.

## Ascension Scoring

When the platform launches:

1. Record printed merit before fate.
2. Reveal all fates.
3. Award fate merit using printed merit and current public state: 2 for main fate, 1 for obsession.
4. Only players with cultivation at least 6 are qualified.
5. Rank qualified players by final merit high to low.
6. Ties break by cultivation high, then remaining spirit high, then clockwise from calamity leader.
7. Qualified players fill open seats in rank order.
8. Filled-seat players ascend and win; other players lose.

## Characters

| id | name | type | trigger | effect | restriction |
| --- | --- | --- | --- | --- | --- |
| R01 | 剑修 | 人物 | 选择抗劫且投入至少2灵力 | 被动：额外产生1点虚拟抗劫贡献 | 虚拟贡献不产生功德 |
| R01-U | 一剑开天 | 本命神通 | 揭晓后 | 本轮增加3点虚拟抗劫贡献 | 不占机缘牌使用上限 |
| R02 | 丹修 | 人物 | 任意玩家将因灵力低于当前雷击成本而失去修为时 | 被动：防止该次修为损失且雷击视为已承受 | 每轮一次且可对自己使用 |
| R02-U | 九转金丹 | 本命神通 | 机缘窗口 | 选择一人恢复最多2修为并获得2灵力 | 不超过轨道上限 |
| R03 | 符修 | 人物 | 执行探索 | 被动：抽3张留1张而非抽2张留1张 | 其余牌照常弃置 |
| R03-U | 镇界符 | 本命神通 | 揭示天劫后且吐纳前 | 本轮忽略天劫特殊文字但不改变需求数值 | 不影响阶段和轮数 |
| R04 | 阵修 | 人物 | 选择修台且投入至少2灵力 | 被动：额外产生1点虚拟修台贡献 | 虚拟贡献不产生功德 |
| R04-U | 逆转阵眼 | 本命神通 | 一道裂痕将令总数达到3时 | 取消这道裂痕 | 不占机缘牌使用上限 |
| R05 | 法修 | 人物 | 揭晓后且机缘窗口前 | 被动：向本轮投入增加1灵力或取回1灵力 | 每轮一次且投入仍不得超过3 |
| R05-U | 移星换斗 | 本命神通 | 揭晓后 | 把自己最多3点投入在修台与抗劫之间转换 | 转换后仍视为只执行一个行动 |
| R06 | 体修 | 人物 | 每轮第一次承受雷击 | 被动：只失去1灵力；若无灵力则失去1修为 | 每轮只影响第一次 |
| R06-U | 法天象地 | 本命神通 | 分配雷击前 | 先承受最多3次雷击；每次失去1灵力或在无灵力时失去1修为 | 玩家自行决定承受次数 |
| R07 | 邪修 | 人物 | 另一名玩家因雷击失去灵力或修为后 | 被动：获得1灵力 | 每轮一次且受储存上限限制 |
| R07-U | 夺运 | 本命神通 | 揭晓后 | 从一名非探索玩家的本轮投入取走1灵力并加入储存区 | 目标行动仍会结算 |

## Opportunity Cards

| id | name | type | trigger | cost | effect | restriction |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | 聚灵丹 | 一次性丹药 | 吐纳灵力后 | 打出并弃置 | 你获得2灵力 | 受储存上限限制 |
| C02 | 破境丹 | 一次性丹药 | 揭晓后且你选择修炼 | 打出并弃置 | 本轮修炼额外增加1修为 | 不消耗额外灵力且修为最高9 |
| C03 | 回气散 | 一次性丹药 | 你因雷击失去灵力后 | 打出并弃置 | 该次雷击结算后获得2灵力 | 受储存上限限制 |
| C04 | 清心露 | 一次性丹药 | 机缘窗口 | 打出并弃置 | 选择一名玩家恢复1修为 | 修为最高9 |
| C05 | 引雷符 | 一次性符箓 | 揭晓后且结算抗劫前 | 打出并弃置 | 本轮增加2点虚拟抗劫贡献 | 不产生功德 |
| C06 | 避雷符 | 一次性符箓 | 你将承受一次雷击时 | 打出并弃置 | 取消这次雷击且视为已承受 | 每轮机缘牌上限仍适用 |
| C07 | 补天石 | 一次性奇物 | 一道裂痕将令总数达到3时 | 打出并弃置 | 取消这道裂痕 | 只能在失败前使用 |
| C08 | 护阵符 | 一次性符箓 | 揭晓后且结算修台前 | 打出并弃置 | 本轮增加2点虚拟修台贡献 | 不产生功德 |
| C09 | 缩地诀 | 一次性秘术 | 揭晓后 | 打出并弃置 | 把你本轮行动在修台与抗劫之间转换且投入量不变 | 不能转换为修炼或探索 |
| C10 | 归元诀 | 一次性秘术 | 揭晓后 | 打出并弃置 | 从本轮投入取回最多2灵力 | 不能令已选非探索行动变为0投入 |
| C11 | 天机简 | 一次性奇物 | 揭示天劫后 | 打出并弃置 | 查看机缘牌库顶3张并以任意顺序放回 | 不能展示所看牌面 |
| C12 | 双生莲 | 一次性灵植 | 机缘窗口 | 打出并弃置 | 把你储存区最多2灵力交给一名玩家 | 不能超过对方储存上限 |
| C13 | 窃灵手 | 一次性秘术 | 揭晓后 | 打出并弃置 | 从一名储存灵力比你多的玩家处取走1灵力 | 不能取走本轮已投入灵力 |
| C14 | 乱阵钉 | 一次性暗器 | 揭晓后 | 打出并弃置 | 把一名玩家已投入修台的1灵力退回其储存区 | 目标仍视为执行修台 |
| C15 | 借劫符 | 一次性邪符 | 你将承受一次雷击时 | 打出并弃置 | 把该雷击转给一名本轮抗劫投入不高于你的玩家 | 每次雷击最多被转移一次 |
| C16 | 观因镜 | 一次性奇物 | 机缘窗口 | 打出并弃置 | 秘密查看一名玩家的全部手牌 | 不能查看天命且不得展示牌面 |
| E01 | 聚灵葫芦 | 持续法宝 | 吐纳灵力时 | 装备后持续 | 若吐纳前你的灵力不超过2则额外获得1灵力 | 受储存上限限制 |
| E02 | 玄龟甲 | 持续法宝 | 每轮第一次承受雷击 | 装备后持续 | 该次雷击少损失1灵力 | 最低损失0但灵力不足规则仍适用 |
| E03 | 青冥剑 | 持续法宝 | 选择抗劫且投入至少2灵力 | 装备后持续 | 额外产生1点虚拟抗劫贡献 | 不产生功德 |
| E04 | 阵纹尺 | 持续法宝 | 选择修台且投入至少2灵力 | 装备后持续 | 额外产生1点虚拟修台贡献 | 不产生功德 |
| E05 | 乾坤袋 | 持续法宝 | 回合结束检查手牌上限时 | 装备后持续 | 你的手牌上限改为5 | 仍只能装备一件法宝 |
| E06 | 归元珠 | 持续法宝 | 回合结束时 | 装备后持续 | 若你的储存灵力为0则获得1灵力 | 受储存上限限制 |
| E07 | 夺灵幡 | 持续法宝 | 另一名玩家因雷击失去灵力后 | 装备后持续 | 你获得1灵力 | 每轮一次且受储存上限限制 |
| E08 | 照影镜 | 持续法宝 | 另一名玩家的机缘牌效果以你为目标并结算后 | 装备后持续 | 你获得1灵力 | 每轮一次且不阻止原效果 |
| C17 | 灵髓丹 | 一次性丹药 | 揭晓后且你选择非探索行动 | 打出并弃置 | 从储存区向本轮投入增加1灵力 | 本次投入可以达到4但仍只能执行原行动 |
| C18 | 定神丹 | 一次性丹药 | 你将因雷击失去修为时 | 打出并弃置 | 防止这次修为损失且雷击视为已承受 | 你仍失去当时全部灵力 |
| C19 | 换骨丹 | 一次性丹药 | 机缘窗口 | 打出并弃置且失去1功德 | 恢复最多2修为 | 没有功德时不能使用 |
| C20 | 假死丹 | 一次性丹药 | 另一名玩家的机缘牌或本命神通以你为目标时 | 打出并弃置 | 取消该效果中只针对你的部分 | 不取消公共效果或目标玩家的行动 |
| C21 | 同心符 | 一次性符箓 | 揭晓后 | 打出并弃置 | 选择一名与你同为修台或同为抗劫的玩家；该公共行动增加1点虚拟贡献 | 你与目标必须选择相同公共行动 |
| C22 | 渡厄符 | 一次性符箓 | 另一名玩家将承受雷击时 | 打出并弃置 | 取消这次雷击且视为已承受 | 不能对自己使用 |
| C23 | 藏锋符 | 一次性符箓 | 有效贡献排序开始前 | 打出并弃置 | 本轮你的灵力在对应修台或抗劫排序中最先填入 | 只影响你当前选择的公共行动 |
| C24 | 封灵符 | 一次性符箓 | 揭晓后 | 打出并弃置 | 选择一名玩家；其本轮不能在常规机缘窗口主动打牌 | 仍可使用反应牌和人物神通 |
| C25 | 窥天简 | 一次性奇物 | 揭示本轮天劫后 | 打出并弃置 | 秘密查看下一张天劫牌并原样放回 | 第8轮不能使用 |
| C26 | 探云尺 | 一次性奇物 | 你将执行探索时且抽牌前 | 打出并弃置 | 本次探索额外抽1张但仍只保留1张 | 符修使用时共抽4张 |
| C27 | 燃灵诀 | 一次性秘术 | 揭晓后且你选择修台或抗劫 | 打出并弃置且支付1灵力 | 你所选公共行动增加2点虚拟贡献 | 不能用于另一项行动且不产生功德 |
| C28 | 借功诀 | 一次性秘术 | 抗劫功德结算后且分配雷击前 | 打出并弃置 | 把你的1功德交给本轮有有效公共贡献的另一名玩家 | 你至少要有1功德 |
| C29 | 逆行诀 | 一次性秘术 | 揭晓后且你选择修炼 | 打出并弃置 | 把本轮行动改为修台或抗劫且投入量不变 | 不能改为探索 |
| C30 | 禁宝咒 | 一次性秘术 | 揭晓后 | 打出并弃置 | 选择一名玩家；其法宝文字本轮失效 | 不弃掉该法宝 |
| C31 | 寄雷咒 | 一次性秘术 | 建立本轮受击顺序前 | 打出并弃置 | 只在决定受击顺序时把你的抗劫投入视为增加2 | 不抵消劫力且不产生功德 |
| C32 | 牵机索 | 一次性奇物 | 另一名玩家探索并弃置机缘牌后 | 打出并弃置且支付2灵力 | 把其刚弃置的那张牌横置加入你的手牌 | 新获得的牌本轮不能使用 |
| E09 | 悟道蒲团 | 持续法宝 | 你选择修炼且投入至少2灵力 | 装备后持续 | 本轮额外增加1修为 | 修为最高9 |
| E10 | 功德碑 | 持续法宝 | 你本轮在一个公共行动中恰好有3点有效贡献 | 装备后持续 | 额外获得1功德 | 每轮一次且虚拟贡献不计 |
| E11 | 遁天梭 | 持续法宝 | 建立受击顺序且比较修为时 | 装备后持续 | 只为受击排序把你的修为视为0 | 不改变真实修为和其他比较 |
| E12 | 观星盘 | 持续法宝 | 揭示本轮天劫后 | 装备后持续 | 你可以秘密查看下一张天劫牌并原样放回 | 每轮一次且第8轮无效果 |
| E13 | 寻宝鼠 | 持续法宝 | 你完成探索后 | 装备后持续 | 获得1灵力 | 受储存上限限制 |
| E14 | 镇魂铃 | 持续法宝 | 你将因雷击失去修为时 | 装备后持续且弃1张手牌 | 防止这次修为损失且雷击视为已承受 | 每轮一次且不能弃掉已装备法宝 |
| E15 | 山河图 | 持续法宝 | 装备后 | 装备后持续 | 你的灵力储存上限改为8 | 失去本法宝时立即弃掉超过6的灵力 |
| E16 | 天罗伞 | 持续法宝 | 另一名玩家的机缘牌或本命神通以你为目标并结算后 | 装备后持续 | 若来源玩家有灵力则其交给你1灵力 | 每轮一次且不阻止原效果 |

## Calamities

| id | name | stage | demand_4p | demand_5p | demand_6p | effect |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | 青霄试雷 | 初劫 | 3 | 4 | 4 | 无额外效果 |
| T02 | 流火雷雨 | 初劫 | 4 | 5 | 5 | 无额外效果 |
| T03 | 枯灵风 | 初劫 | 3 | 4 | 4 | 本轮每人只吐纳2灵力 |
| T04 | 散魄雷 | 初劫 | 3 | 4 | 4 | 本轮普通雷击需要失去3灵力才能完全承受 |
| T05 | 禁符微劫 | 初劫 | 3 | 4 | 4 | 本轮不能主动打出一次性机缘牌；反应牌与已装备法宝仍有效 |
| T06 | 回光灵雨 | 初劫 | 2 | 3 | 3 | 若本轮没有产生雷击则结算后功德最低者获得1灵力 |
| T07 | 地火焚台 | 重劫 | 4 | 5 | 6 | 无额外效果 |
| T08 | 五雷轰顶 | 重劫 | 5 | 6 | 7 | 无额外效果 |
| T09 | 万法寂灭 | 重劫 | 4 | 5 | 6 | 本轮不能打出任何机缘牌且法宝文字失效 |
| T10 | 夺灵黑雾 | 重劫 | 4 | 5 | 6 | 本轮每人只吐纳2灵力 |
| T11 | 天妒雷纹 | 重劫 | 4 | 5 | 6 | 雷击顺序的修为比较改为功德较高者优先 |
| T12 | 返照天光 | 重劫 | 3 | 4 | 5 | 若本轮没有产生雷击则结算后移除1道裂痕 |
| T13 | 九霄紫雷 | 灭世劫 | 6 | 7 | 8 | 无额外效果 |
| T14 | 群星坠落 | 灭世劫 | 7 | 8 | 9 | 无额外效果 |
| T15 | 法宝失灵 | 灭世劫 | 6 | 7 | 8 | 本轮所有已装备法宝文字失效 |
| T16 | 灭魂罡风 | 灭世劫 | 6 | 7 | 8 | 本轮普通雷击需要失去3灵力才能完全承受 |
| T17 | 破台天罚 | 灭世劫 | 5 | 6 | 7 | 若产生雷击则第一击直接令登仙台获得1道裂痕；其余雷击正常分配 |
| T18 | 天道震怒 | 灭世劫 | 6 | 7 | 8 | 若揭示时登仙台已有2道裂痕则本牌需求增加2 |

## Fates

| id | name | main fate | main reward | obsession | obsession reward |
| --- | --- | --- | --- | --- | --- |
| F01 | 护道因果 | 因果对象的修为至少为6 | 2功德 | 你的剩余灵力至少为5 | 1功德 |
| F02 | 压胜之命 | 你的印刷功德高于因果对象 | 2功德 | 你的修为至少为8 | 1功德 |
| F03 | 共登之约 | 你与因果对象的修为都至少为6 | 2功德 | 你装备着法宝 | 1功德 |
| F04 | 断其仙缘 | 因果对象的修为不高于5 | 2功德 | 你的剩余灵力恰好为0 | 1功德 |
| F05 | 劫富命数 | 因果对象的剩余灵力不高于1 | 2功德 | 你的手牌至少为2张 | 1功德 |
| F06 | 养运待割 | 因果对象的剩余灵力至少为5 | 2功德 | 你的修为恰好为6 | 1功德 |
| F07 | 道高一尺 | 你的修为高于因果对象 | 2功德 | 你的印刷功德至少为10 | 1功德 |
| F08 | 同境相争 | 你的修为与因果对象相同 | 2功德 | 你的手牌为0张 | 1功德 |
| F09 | 功德债主 | 因果对象的印刷功德至少为8 | 2功德 | 你与因果对象的印刷功德差不超过2 | 1功德 |
| F10 | 恶名相照 | 因果对象的印刷功德不高于5 | 2功德 | 你装备着法宝 | 1功德 |
| F11 | 宝光招劫 | 因果对象装备着法宝 | 2功德 | 你的剩余灵力至少为4 | 1功德 |
| F12 | 两手空空 | 因果对象的手牌为0张 | 2功德 | 你的修为至少为7 | 1功德 |
