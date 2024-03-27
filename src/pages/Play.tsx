import { useMutation, useQuery } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GameState, gameStateFromRaw, getGameStatus, step } from "../../hanabi";
import { List, Map, Set } from "immutable";
import { useMemo, useState } from "react";
import { Action, COLORS, Color, HAND_POSNS_4, HAND_POSNS_5, HandPosn, RANKS, Rank } from "../../convex/schema";

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

type CommonKnowledge = Map<string, Map<HandPosn, { possibleColors: Set<Color>, possibleRanks: Set<Rank> }>>;
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

export function Page({ id, viewer }: Props) {
    const gameQ = useQuery(api.games.get, { id });
    const act = useMutation(api.games.act);

    const [frame, setFrame] = useState<number | null>(null);

    const states = useMemo<List<{ g: GameState, ck: CommonKnowledge }>>(() => {
        if (gameQ === undefined) return List();
        let states = List.of({ g: gameStateFromRaw(gameQ.init.initState), ck: totalIgnorance(List(gameQ.init.initState.players).map(p => p.name)) });
        for (const action of gameQ.actions) {
            const { g, ck } = states.last()!;
            states = states.push({ g: step(g, action.data), ck: stepCommonKnowledge(g, ck, action.data) });
        }
        return states;
    }, [gameQ]);
    const clampFrame = (frame: number | null) => frame === null ? null : Math.min(states.size - 1, Math.max(0, frame));

    if (gameQ === undefined) {
        return <div>Loading...</div>
    }

    const { g: game, ck: commonKnowledge } = (frame === null ? states.last()! : states.get(frame)!);
    const canonicallyOrderedPlayers = game.players.sortBy(player => states.first()!.g.players.findIndex(p => p.name === player.name));
    const status = getGameStatus(game);

    const canAct = status.type === 'playing' && frame === null && game.players.first()!.name === viewer;

    const canGoBack = (frame === null) ? states.size > 1 : frame > 0;
    const canGoForward = frame !== null && frame < states.size - 1;

    const handPosns = game.players.size >= 4 ? HAND_POSNS_4 : HAND_POSNS_5;

    return (
        <div>
            {frame !== null && <>Viewing frame {frame + 1}/{states.size}</>}
            <button disabled={!canGoBack} onClick={() => {
                if (!canGoBack) return;
                setFrame(clampFrame(frame === null ? states.size - 2 : frame - 1));
            }}> &lt; </button>
            <button disabled={!canGoForward} onClick={() => {
                if (!canGoForward) return;
                setFrame(clampFrame(frame + 1));
            }}> &gt; </button>
            <button onClick={() => { setFrame(null) }}>Live</button>
            <div>
                {status.type === 'over' ? 'Game ended!' : status.type === 'lost' ? <span style={{ color: 'red' }}>YOU LOOOOSE</span> : ''}
                <div>Score: {game.towers.valueSeq().reduce((acc, r) => acc + r, 0)}</div>
                <div>Hints: {game.nHints}</div>
                <div>Strikes: {game.nStrikes}</div>
                <div>Towers: {COLORS.map(c => [c, game.towers.get(c)]).filter(([, r]) => r !== undefined).map(([c, r]) => `${c}: ${r}`).join(', ')}</div>
                <div>Deck size: {game.deck.size}</div>
                {game.movesLeft !== undefined && <div>Moves left: {game.movesLeft} ({game.players.get(game.movesLeft - 1)!.name} is last)</div>}
                <div>
                    Unseen cards:
                    <table>
                        <tbody>
                            <tr>
                                <td></td>
                                {RANKS.map(rank => <td key={rank}>{rank}</td>)}
                            </tr>
                            {COLORS.map(color => <tr key={color}>
                                <td>{renderColor(color)}</td>
                                {RANKS.map(rank => <td key={rank}>{game.deck.filter(card => card.color === color && card.rank === rank).size}</td>)}
                            </tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        {canonicallyOrderedPlayers.map(player => (<th key={player.name} style={{ textAlign: 'center', width: `${100 / game.players.size}%` }}>{player.name}</th>))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {canonicallyOrderedPlayers.map(player => {
                            const isViewer = player.name === viewer;
                            return <td key={player.name} style={{ border: '1px solid black' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'start' }}>
                                    <div style={{ margin: 'auto' }}>
                                        {handPosns.map(posn => {
                                            const card = player.hand.get(posn);
                                            const ck = commonKnowledge.get(player.name)!.get(posn)!;
                                            return <div key={posn} style={{ margin: 'auto', display: 'block' }}>
                                                {isViewer
                                                    ? <>
                                                        {card === undefined ? <button disabled>_</button> : <button disabled={!canAct} onClick={() => { act({ game: id, action: { type: "play", posn } }).catch(console.error) }}>Play</button>}
                                                        {card === undefined ? <button disabled>_</button> : <button disabled={!canAct} onClick={() => { act({ game: id, action: { type: "discard", posn } }).catch(console.error) }}>Discard</button>}
                                                        {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                                                    </>
                                                    : <>
                                                        {card === undefined ? <button disabled>_</button> : <button disabled={!canAct || game.nHints === 0} style={{ width: '2em' }} onClick={() => { act({ game: id, action: { type: "hintColor", targetName: player.name, color: card.color } }).catch(console.error) }}>{renderColor(card.color)}</button>}
                                                        {card === undefined ? <button disabled>_</button> : <button disabled={!canAct || game.nHints === 0} style={{ width: '2em' }} onClick={() => { act({ game: id, action: { type: "hintRank", targetName: player.name, rank: card.rank } }).catch(console.error) }}>{card.rank}</button>}
                                                        {' '} ({ck.possibleColors.sort().map(renderColor).join('')} {ck.possibleRanks.sort().join('')})
                                                    </>

                                                }
                                            </div>
                                        })}</div></div>
                            </td>
                        })}
                    </tr>
                </tbody>
            </table>

            History:
            <table>
                <thead>
                    <tr>
                        <th>Frame</th>
                        <th>Player</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {gameQ.actions.map((action, i) => {
                        const activePlayer = states.get(i)!.g.players.first()!.name;
                        return <tr key={i}>
                            <td>
                                <button onClick={() => { setFrame(i) }}>{i + 1}</button>
                            </td>
                            <td>{activePlayer}</td>
                            <td>{(() => {
                                switch (action.data.type) {
                                    case 'play': return <>play {action.data.posn}</>
                                    case 'discard': return <>discard {action.data.posn}</>
                                    case 'hintColor': return <>hint {action.data.targetName}: {renderColor(action.data.color)}</>
                                    case 'hintRank': return <>hint {action.data.targetName}: {action.data.rank}</>
                                }
                            })()}</td>
                        </tr>
                    }).reverse()}
                </tbody>
            </table>
        </div>
    )
}