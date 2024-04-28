import { useMutation, useQuery } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GameState, gameStateFromRaw, getGameStatus, isPlaySuccessful, multiplicities, step, unshuffledDeck } from "../../hanabi";
import { List, Map, Set } from "immutable";
import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { Action, COLORS, Card, Color, HAND_POSNS_4, HAND_POSNS_5, HandPosn, RANKS, Rank } from "../../convex/schema";
import { ReqStatus } from "../common";

export interface Props {
    id: Id<'games'>;
    viewer: string;
}

const renderColor = (color: string) => {
    switch (color) {
        case 'blue': return 'B';
        case 'green': return 'G';
        case 'red': return 'R';
        case 'white': return 'W';
        case 'yellow': return 'Y';
    }
}

type HandCommonKnowledge = Map<HandPosn, { possibleColors: Set<Color>, possibleRanks: Set<Rank> }>
type CommonKnowledge = Map<string, HandCommonKnowledge>;
const totalIgnorance = (playerNames: List<string>): CommonKnowledge => {
    const handPosns = playerNames.size >= 4 ? HAND_POSNS_4 : HAND_POSNS_5; // TODO: deduplicate this logic
    return Map(playerNames.map(name => [name, Map(handPosns.map(posn => [posn, { possibleColors: Set(COLORS), possibleRanks: Set(RANKS) }]))]));
}
const stepCommonKnowledge = (g: GameState, ck: CommonKnowledge, action: Action): CommonKnowledge => {
    switch (action.type) {
        case 'discard':
            return ck.update(
                g.players.first()!.name,
                h => h!.set(action.posn, { possibleColors: Set(COLORS), possibleRanks: Set(RANKS) }),
            );
        case 'play':
            return ck.update(
                g.players.first()!.name,
                h => h!.set(action.posn, { possibleColors: Set(COLORS), possibleRanks: Set(RANKS) }),
            );
        case 'hintColor':
            return ck.update(
                action.targetName,
                h => h!.map((cardCK, posn) => ({
                    ...cardCK,
                    possibleColors: g.players.find(p => p.name === action.targetName)!.hand.get(posn)?.color === action.color ? Set([action.color]) : cardCK.possibleColors.remove(action.color),
                })),
            );
        case 'hintRank':
            return ck.update(
                action.targetName,
                h => h!.map((cardCK, posn) => ({
                    ...cardCK,
                    possibleRanks: g.players.find(p => p.name === action.targetName)!.hand.get(posn)?.rank === action.rank ? Set([action.rank]) : cardCK.possibleRanks.remove(action.rank),
                })),
            );
    }
}

function CardCountingTable({ counts, cellStyle }: {
    counts: Map<Color, Map<Rank, number>>,
    cellStyle?: (color: Color, rank: Rank) => CSSProperties,
}) {
    return <table>
        <tbody>
            <tr>
                <td></td>
                {RANKS.map(rank => <td key={rank}>{rank}</td>)}
            </tr>
            {COLORS.map(color => <tr key={color}>
                <td>{renderColor(color)}</td>
                {RANKS.map(rank => <td key={rank} style={cellStyle?.(color, rank) ?? {}}>{counts.get(color)?.get(rank) ?? 0}</td>)}
            </tr>)}
        </tbody>
    </table>
}

function OwnHandView({ posns, focus, presentPosns, commonKnowledge, actions }: {
    posns: List<HandPosn>,
    focus: (p: HandPosn | null) => void,
    presentPosns: Set<HandPosn>,
    commonKnowledge: HandCommonKnowledge,
    actions: null | {
        play: (posn: HandPosn) => Promise<unknown>,
        discard: (posn: HandPosn) => Promise<unknown>,
    },
}) {
    return (
        <div>
            {posns.map((posn) => {
                const ck = commonKnowledge.get(posn)!;
                return <div key={posn} style={{ margin: 'auto', display: 'block' }}
                    onMouseEnter={() => { focus(posn) }}
                    onMouseLeave={() => { focus(null) }}
                >
                    {!presentPosns.contains(posn) ? <button disabled>_</button> : <button disabled={!actions} onClick={() => { actions!.play(posn).catch(console.error) }}>Play</button>}
                    {!presentPosns.contains(posn) ? <button disabled>_</button> : <button disabled={!actions} onClick={() => { actions!.discard(posn).catch(console.error) }}>Discard</button>}
                    {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                </div>
            })}
        </div>
    )
}

function OtherHandView({ posns, focus, hand, commonKnowledge, hint }: {
    posns: List<HandPosn>,
    focus: (p: HandPosn | null) => void,
    hand: Map<HandPosn, Card>,
    commonKnowledge: HandCommonKnowledge,
    hint: null | {
        color: (color: Color) => Promise<unknown>,
        rank: (rank: Rank) => Promise<unknown>,
    },
}) {
    return (
        <div>
            {posns.map((posn) => {
                const card = hand.get(posn);
                const ck = commonKnowledge.get(posn)!;
                return <div key={posn} style={{ margin: 'auto', display: 'block' }}
                    onMouseEnter={() => { focus(posn) }}
                    onMouseLeave={() => { focus(null) }}
                >
                    {card === undefined ? <button disabled>_</button> : <button disabled={!hint} style={{ width: '2em' }} onClick={() => { hint!.color(card.color).catch(console.error) }}>{renderColor(card.color)}</button>}
                    {card === undefined ? <button disabled>_</button> : <button disabled={!hint} style={{ width: '2em' }} onClick={() => { hint!.rank(card.rank).catch(console.error) }}>{card.rank}</button>}
                    {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                </div>
            })}
        </div>
    )
}

function GameView({ act, focus, game, commonKnowledge, viewer, canonicalPlayerOrder, frozen }: {
    act: (action: Action) => Promise<unknown>,
    focus: (p: { posn: HandPosn, player: string } | null) => void,
    game: GameState,
    commonKnowledge: CommonKnowledge,
    viewer: string,
    canonicalPlayerOrder: List<string>,
    frozen: boolean,
}) {

    const status = getGameStatus(game);

    const canAct = status.type === 'playing' && !frozen && game.players.first()!.name === viewer;
    const canonicallyOrderedPlayers = canonicalPlayerOrder.map(pn => game.players.find(p => p.name === pn)!);

    const handPosns = game.players.size >= 4 ? HAND_POSNS_4 : HAND_POSNS_5;

    const unseenCards = useMemo(() => {
        let res = Map<Color, Map<Rank, number>>();
        const incr = (c: Card) => { res = res.update(c.color, Map(), r => r.update(c.rank, 0, x => x + 1)) };
        for (const card of game.deck) {
            incr(card);
        }
        for (const card of game.players.find(p => p.name === viewer)!.hand.valueSeq()) {
            incr(card);
        }
        return res;
    }, [game, viewer])

    const discardPile = useMemo(() => {
        let unaccountedFor = unshuffledDeck.reduce((acc, c) => acc.update(c.color, Map(), r => r.update(c.rank, 0, x => x + 1)), Map<Color, Map<Rank, number>>());
        const decr = (c: Card) => { unaccountedFor = unaccountedFor.update(c.color, Map(), r => r.update(c.rank, 0, x => x - 1)) };
        for (const card of game.deck) {
            decr(card);
        }
        for (const player of game.players) {
            for (const card of player.hand.valueSeq()) {
                decr(card);
            }
        }
        for (const [color, towerRank] of game.towers.entries()) {
            for (let i = 1 as Rank; i <= towerRank; i++) {
                decr({ color, rank: i });
            }
        }
        return unaccountedFor;
    }, [game]);

    return (
        <div>
            <div>
                {status.type === 'over'
                    ? <h1 style={{ textAlign: 'center' }}>Game ended!</h1>
                    : status.type === 'lost'
                        ? <h1 style={{ textAlign: 'center', color: 'red' }}>YOU LOOOOSE</h1>
                        : ''}
                <div>Score: {game.towers.valueSeq().reduce((acc, r) => acc + r, 0)}</div>
                <div>Hints: {game.nHints}</div>
                <div>Strikes: {game.nStrikes} / 4</div>
                <div>Towers: {COLORS.map(c => {
                    const r = game.towers.get(c);
                    if (!r) return '';
                    return <span key={c}>{renderColor(c)}{r} {" "}</span>;
                })}</div>
                <div>Cards left: {game.deck.size}</div>
                {game.movesLeft !== undefined && <div>Moves left: {game.movesLeft} ({game.players.get(game.movesLeft - 1)!.name} is last)</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    <div style={{ padding: '0.5em', margin: '0 0.5em', border: '1px solid black' }}>
                        Not yet seen:
                        <CardCountingTable counts={unseenCards} />
                    </div>
                    <div style={{ padding: '0.5em', margin: '0 0.5em', border: '1px solid black' }}>
                        Burned:
                        <CardCountingTable counts={discardPile}
                            cellStyle={(color, rank) => {
                                const numBurned = discardPile.get(color)?.get(rank) ?? 0;
                                const numRemaining = multiplicities.count(r => r === rank) - numBurned;
                                if (rank < game.towers.get(color, 0)) {
                                    return { backgroundColor: 'lightblue', color: 'transparent' }
                                }
                                if (rank === game.towers.get(color, 0)) {
                                    return { backgroundColor: 'lightblue', borderRight: '0.2em solid blue', color: 'transparent' }
                                }
                                if ((discardPile.get(color)?.get(rank) ?? 0) === 0) {
                                    return { visibility: 'hidden' }
                                }
                                if (numRemaining === 1) {
                                    return { border: '1px solid red' };
                                }
                                if (numRemaining === 0) {
                                    return { backgroundColor: 'red', color: 'transparent' };
                                }
                                return {};
                            }}
                        />
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {canonicallyOrderedPlayers.map(player => {
                    const isViewer = player.name === viewer;
                    return <div key={player.name} style={{ margin: '0.2em', padding: '0.3em', border: '1px solid lightgray' }}>
                        <div style={{ textAlign: 'center', backgroundColor: player.name === game.players.first()!.name ? 'lightgray' : 'inherit' }}>
                            {player.name}
                        </div>
                        <div style={{ margin: 'auto' }}>
                            {isViewer
                                ? <OwnHandView
                                    posns={handPosns}
                                    focus={posn => { focus(posn ? { posn, player: player.name } : null) }}
                                    commonKnowledge={commonKnowledge.get(player.name)!}
                                    presentPosns={handPosns.filter(posn => player.hand.get(posn)).toSet()}
                                    actions={canAct
                                        ? {
                                            play: (posn) => act({ type: "play", posn }),
                                            discard: (posn) => act({ type: "discard", posn })
                                        }
                                        : null} />
                                : <OtherHandView
                                    posns={handPosns}
                                    focus={posn => { focus(posn ? { posn, player: player.name } : null) }}
                                    commonKnowledge={commonKnowledge.get(player.name)!}
                                    hand={player.hand}
                                    hint={canAct
                                        ? {
                                            color: (color) => act({ type: "hintColor", targetName: player.name, color }),
                                            rank: (rank) => act({ type: "hintRank", targetName: player.name, rank }),
                                        }
                                        : null} />
                            }
                        </div>
                    </div>
                })}
            </div>
        </div>
    )
}

function FreezeFrameControls({ frame, back, fwd, unfreeze, currentFrame }: { frame: number | null, back: null | (() => void), fwd: null | (() => void), unfreeze: () => void, currentFrame: number }) {
    return <div>
        Viewing time step {" "}
        <button disabled={!back} onClick={() => back?.()}> &lt; </button>
        {" "} {(frame ?? currentFrame) + 1} / {currentFrame + 1} {" "}
        <button disabled={frame === null} onClick={() => fwd?.()}> &gt; </button>
        {" "}{frame === null ? '(Live updating)' : <button onClick={unfreeze}>Unfreeze</button>}
    </div>;
}

function PrivateNotesForm({ curSavedText, setNote }: { curSavedText: string, setNote: (text: string) => Promise<unknown> }) {
    const [text, setText] = useState(curSavedText);
    useEffect(() => { setText(curSavedText) }, [curSavedText]);
    const [status, setStatus] = useState<ReqStatus>({ type: 'idle' });

    return <form onSubmit={e => {
        e.preventDefault();
        setStatus({ type: 'working' });
        (async () => {
            try { await setNote(text); setStatus({ type: 'idle' }) }
            catch (e) { setStatus({ type: 'error', message: e instanceof Error ? e.message : `weird-typed error: ${e}` }) }
        })().catch(console.error);
    }}>
        <input disabled={status.type === 'working'} type="text" value={text} onChange={e => { setText(e.target.value) }} style={{ minWidth: '20em', }} />
        <button disabled={status.type === 'working'} type="submit">Save</button>
        {status.type === 'error' && <span style={{ color: 'red' }}>{status.message}</span>}
    </form>
}

export function Page({ id, viewer }: Props) {
    const gameQ = useQuery(api.games.get, { id });
    const act = useMutation(api.games.act);
    const notesQ = useQuery(api.games.getNotes, { game: id, viewer });
    const notesByFrame = useMemo<Map<number, string>>(() => {
        if (notesQ === undefined) return Map();
        return Map(notesQ.map(n => [n.frame, n.text]));
    }, [notesQ]);
    const setNote = useMutation(api.games.setNotes);

    const states = useMemo<List<{ g: GameState, ck: CommonKnowledge }>>(() => {
        if (gameQ === undefined) return List();
        let states = List.of({ g: gameStateFromRaw(gameQ.init.initState), ck: totalIgnorance(List(gameQ.init.initState.players).map(p => p.name)) });
        for (const action of gameQ.actions) {
            const { g, ck } = states.last()!;
            states = states.push({ g: step(g, action.data), ck: stepCommonKnowledge(g, ck, action.data) });
        }
        return states;
    }, [gameQ]);

    const [frame, setFrame] = useState<number | null>(null);
    const frameBack = useMemo(() => {
        if (frame === 0) return null;
        if (frame === null && states.size === 1) return null;
        return () => { console.log('back', { frame, size: states.size }); setFrame(Math.max(0, (frame ?? states.size - 1) - 1)) };
    }, [frame, states.size]);
    const frameForward = useMemo(() => {
        if (frame === null) return null;
        return () => { console.log('fwd', { frame, size: states.size }); setFrame(frame >= states.size - 1 ? null : frame + 1) };
    }, [frame, states.size]);

    useEffect(() => {
        const f = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                frameBack?.();
            } else if (e.key === 'ArrowRight') {
                frameForward?.();
            }
        }
        window.addEventListener('keydown', f);
        return () => { window.removeEventListener('keydown', f) };
    }, [frameBack, frameForward]);

    const undo = useMutation(api.games.undo);
    const [undoableAction, setUndoableAction] = useState<{ id: Id<'actions'>, forbiddenceCallbackId: number } | null>(null);
    const forbidUndo = useCallback(() => {
        if (undoableAction) {
            useCallback
            clearTimeout(undoableAction.forbiddenceCallbackId);
        }
        setUndoableAction(null);
    }, [undoableAction, setUndoableAction]);
    useEffect(() => {
        if (undoableAction && gameQ && List(gameQ.actions).last()?._id !== undoableAction.id) {
            forbidUndo();
        }
    }, [gameQ, forbidUndo, undoableAction])

    const [focusedCard, setFocusedCard] = useState<{ posn: HandPosn, player: string } | null>(null);
    const actionsHintingAtFocusedCard: Set<number> = useMemo(() => {
        if (focusedCard === null) return Set();
        if (gameQ === undefined) return Set();
        let res = Set<number>();
        for (let i = (frame ?? states.size - 1) - 1; i >= 0; i--) {
            const origState = states.get(i)!;
            const action = gameQ.actions[i];
            const handThen = origState.g.players.find(p => p.name === focusedCard.player)!.hand;
            switch (action.data.type) {
                case 'discard':
                case 'play':
                    if (origState.g.players.first()!.name === focusedCard.player && action.data.posn === focusedCard.posn) {
                        return res;
                    }
                    break;
                case 'hintColor':
                    if (action.data.targetName === focusedCard.player && action.data.color === handThen.get(focusedCard.posn)?.color) {
                        res = res.add(i);
                    }
                    break;
                case 'hintRank':
                    if (action.data.targetName === focusedCard.player && action.data.rank === handThen.get(focusedCard.posn)?.rank) {
                        res = res.add(i);
                    }
                    break;

            }
        }
        return res;
    }, [focusedCard, gameQ, frame, states]);

    if (gameQ === undefined) {
        return <div>Loading...</div>
    }

    const { g: game, ck: commonKnowledge } = (frame === null ? states.last()! : states.get(frame)!);

    return (
        <div>
            <div style={{ border: '1px solid black', padding: '1em' }}>
                <FreezeFrameControls frame={frame} back={frameBack} fwd={frameForward} unfreeze={() => { setFrame(null) }} currentFrame={states.size - 1} />
                {frame !== null && states.last()!.g.players.first()!.name === viewer && <h3 style={{ color: 'red' }}> In real time, it's your turn! <button onClick={() => { setFrame(null) }}>Unfreeze</button> to play! </h3>}
                <GameView
                    act={async (action) => {
                        const actionId = await act({ game: id, action });
                        const canUndoMillis = 1000 * 10;
                        const callbackId = setTimeout(forbidUndo, canUndoMillis);
                        setUndoableAction({ id: actionId, forbiddenceCallbackId: callbackId });
                    }}
                    focus={setFocusedCard}
                    game={game}
                    commonKnowledge={commonKnowledge}
                    canonicalPlayerOrder={states.first()!.g.players.map(p => p.name)} frozen={frame !== null}
                    viewer={viewer} />
                {undoableAction && <button style={{ fontSize: '2rem' }} onClick={() => {
                    setUndoableAction(null);
                    undo({ game: id, id: undoableAction.id }).catch(console.error);
                }}>Undo</button>}
            </div>

            History:
            <table>
                <thead>
                    <tr>
                        <th>Before</th>
                        <th>Player</th>
                        <th>Action</th>
                        <th>After</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {gameQ.actions.map((action, i) => {
                        const prevState = states.get(i)!.g;
                        const activePlayer = states.get(i)!.g.players.first()!.name;
                        return <tr key={i}>
                            <td style={{ textAlign: 'center', background: i === frame ? 'pink' : 'inherit' }}>
                                <button onClick={() => { setFrame(i) }}>{i + 1}</button>
                            </td>
                            <td>{activePlayer}</td>
                            <td style={actionsHintingAtFocusedCard.contains(i) ? { backgroundColor: 'pink' } : {}}>{(() => {
                                switch (action.data.type) {
                                    case 'play':
                                        const playedCardP = prevState.players.first()!.hand.get(action.data.posn)!;
                                        return <>
                                            {isPlaySuccessful(prevState.towers, prevState.players.first()!.hand.get(action.data.posn)!)
                                                ? 'played'
                                                : 'misplayed'}
                                            {" "} {renderColor(playedCardP.color)}{playedCardP.rank}
                                            {" "} from
                                            {" "} {action.data.posn}
                                        </>
                                    case 'discard':
                                        const playedCardD = prevState.players.first()!.hand.get(action.data.posn)!;
                                        return <>
                                            discarded
                                            {" "} {renderColor(playedCardD.color)}{playedCardD.rank}
                                            {" "} from
                                            {" "} {action.data.posn}
                                        </>
                                    case 'hintColor':
                                        return <>hint {action.data.targetName}: {renderColor(action.data.color)}</>
                                    case 'hintRank':
                                        return <>hint {action.data.targetName}: {action.data.rank}</>
                                }
                            })()}</td>
                            <td style={{ textAlign: 'center' }}>
                                <button onClick={() => { setFrame(i === states.size - 2 ? null : i + 1) }}>{i === states.size - 2 ? '(now)' : i + 1 + 1}</button>
                            </td>
                            <td>
                                <PrivateNotesForm curSavedText={notesByFrame.get(i, '')} setNote={(text) => setNote({ game: id, viewer, frame: i, text })} />
                            </td>
                        </tr>
                    }).reverse()}
                </tbody>
            </table>
        </div>
    )
}