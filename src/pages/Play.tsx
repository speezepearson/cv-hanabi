import { useMutation, useQuery } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GameState, gameStateFromRaw, getGameStatus, isPlaySuccessful, step } from "../../hanabi";
import { List, Map, Set } from "immutable";
import { useEffect, useMemo, useState } from "react";
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

function UnseenCardsTable({ unseen }: { unseen: List<Card> }) {
    const counts = unseen.groupBy(card => card.color + card.rank).map(cards => cards.size);
    return <table>
        <tbody>
            <tr>
                <td></td>
                {RANKS.map(rank => <td key={rank}>{rank}</td>)}
            </tr>
            {COLORS.map(color => <tr key={color}>
                <td>{renderColor(color)}</td>
                {RANKS.map(rank => <td key={rank}>{counts.get(color + rank, 0)}</td>)}
            </tr>)}
        </tbody>
    </table>
}

function OwnHandView({ posns, presentPosns, commonKnowledge, actions }: {
    posns: List<HandPosn>,
    presentPosns: Set<HandPosn>,
    commonKnowledge: HandCommonKnowledge,
    actions: null | {
        play: (posn: HandPosn) => Promise<any>,
        discard: (posn: HandPosn) => Promise<any>,
    },
}) {
    return (
        <div>
            {posns.map((posn) => {
                const ck = commonKnowledge.get(posn)!;
                return <div key={posn} style={{ margin: 'auto', display: 'block' }}>
                    {!presentPosns.contains(posn) ? <button disabled>_</button> : <button disabled={!actions} onClick={() => { actions!.play(posn).catch(console.error) }}>Play</button>}
                    {!presentPosns.contains(posn) ? <button disabled>_</button> : <button disabled={!actions} onClick={() => { actions!.discard(posn).catch(console.error) }}>Discard</button>}
                    {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                </div>
            })}
        </div>
    )
}

function OtherHandView({ posns, hand, commonKnowledge, hint }: {
    posns: List<HandPosn>,
    hand: Map<HandPosn, Card>,
    commonKnowledge: HandCommonKnowledge,
    hint: null | {
        color: (color: Color) => Promise<any>,
        rank: (rank: Rank) => Promise<any>,
    },
}) {
    return (
        <div>
            {posns.map((posn) => {
                const card = hand.get(posn);
                const ck = commonKnowledge.get(posn)!;
                return <div key={posn} style={{ margin: 'auto', display: 'block' }}>
                    {card === undefined ? <button disabled>_</button> : <button disabled={!hint} style={{ width: '2em' }} onClick={() => { hint!.color(card.color).catch(console.error) }}>{renderColor(card.color)}</button>}
                    {card === undefined ? <button disabled>_</button> : <button disabled={!hint} style={{ width: '2em' }} onClick={() => { hint!.rank(card.rank).catch(console.error) }}>{card.rank}</button>}
                    {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                </div>
            })}
        </div>
    )
}

function GameView({ id, game, commonKnowledge, viewer, canonicalPlayerOrder, frozen }: { id: Id<'games'>, game: GameState, commonKnowledge: CommonKnowledge, viewer: string, canonicalPlayerOrder: List<string>, frozen: boolean }) {
    const act = useMutation(api.games.act);

    const status = getGameStatus(game);

    const canAct = status.type === 'playing' && !frozen && game.players.first()!.name === viewer;
    const canonicallyOrderedPlayers = canonicalPlayerOrder.map(pn => game.players.find(p => p.name === pn)!);

    const handPosns = game.players.size >= 4 ? HAND_POSNS_4 : HAND_POSNS_5;

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
                    return <><span key={c}>{renderColor(c)}{r}</span> {" "}</>;
                })}</div>
                <div>Cards left: {game.deck.size}</div>
                {game.movesLeft !== undefined && <div>Moves left: {game.movesLeft} ({game.players.get(game.movesLeft - 1)!.name} is last)</div>}
                <details>
                    <summary>Count unseen cards</summary>
                    <UnseenCardsTable unseen={game.deck.concat(game.players.find(p => p.name === viewer)!.hand.valueSeq())} />
                </details>
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
                                ? <OwnHandView posns={handPosns} commonKnowledge={commonKnowledge.get(player.name)!} presentPosns={handPosns.filter(posn => player.hand.get(posn)).toSet()} actions={canAct ? { play: (posn) => act({ game: id, action: { type: "play", posn } }), discard: (posn) => act({ game: id, action: { type: "discard", posn } }) } : null} />
                                : <OtherHandView posns={handPosns} commonKnowledge={commonKnowledge.get(player.name)!} hand={player.hand} hint={canAct ? { color: (color) => act({ game: id, action: { type: "hintColor", targetName: player.name, color } }), rank: (rank) => act({ game: id, action: { type: "hintRank", targetName: player.name, rank } }) } : null} />
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

function PrivateNotesForm({ curSavedText, setNote }: { curSavedText: string, setNote: (text: string) => Promise<any> }) {
    const [text, setText] = useState(curSavedText);
    useEffect(() => { setText(curSavedText) }, [curSavedText]);
    const [status, setStatus] = useState<ReqStatus>({ type: 'idle' });

    return <form onSubmit={e => {
        e.preventDefault();
        setStatus({ type: 'working' });
        (async () => {
            try { await setNote(text); setStatus({ type: 'idle' }) }
            catch (e: unknown) { setStatus({ type: 'error', message: e instanceof Object ? e.toString() : typeof e === 'string' ? e : `weird-typed error: ${e}` }) }
        })().catch(console.error);
    }}>
        <input disabled={status.type === 'working'} type="text" value={text} onChange={e => { setText(e.target.value) }} style={{ minWidth: '20em', }} />
        <button disabled={status.type === 'working'} type="submit">Save</button>
        {status.type === 'error' && <span style={{ color: 'red' }}>{status.message}</span>}
    </form>
}

export function Page({ id, viewer }: Props) {
    const gameQ = useQuery(api.games.get, { id });
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
        return () => { console.log('unbinding'); window.removeEventListener('keydown', f) };
    }, [frameBack, frameForward]);

    if (gameQ === undefined) {
        return <div>Loading...</div>
    }

    const { g: game, ck: commonKnowledge } = (frame === null ? states.last()! : states.get(frame)!);

    return (
        <div>
            <div style={{ border: '1px solid black', padding: '1em' }}>
                <FreezeFrameControls frame={frame} back={frameBack} fwd={frameForward} unfreeze={() => { setFrame(null) }} currentFrame={states.size - 1} />
                {frame !== null && states.last()!.g.players.first()!.name === viewer && <h3 style={{ color: 'red' }}> In real time, it's your turn! <button onClick={() => { setFrame(null) }}>Unfreeze</button> to play! </h3>}
                <GameView id={id} game={game} commonKnowledge={commonKnowledge} canonicalPlayerOrder={states.first()!.g.players.map(p => p.name)} frozen={frame !== null} viewer={viewer} />
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
                            <td>{(() => {
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