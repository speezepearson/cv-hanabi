import { useMutation, useQuery } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { GameState, gameStateFromRaw, step } from "../../hanabi";
import { List } from "immutable";
import { useMemo, useState } from "react";
import { COLORS, HAND_POSNS_4, HAND_POSNS_5 } from "../../convex/schema";

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

export function Page({ id, viewer }: Props) {
    const gameQ = useQuery(api.games.get, { id });
    const act = useMutation(api.games.act);

    const [frame, setFrame] = useState<number | null>(null);

    const states = useMemo<List<GameState>>(() => {
        if (gameQ === undefined) return List();
        let states = List.of(gameStateFromRaw(gameQ.init.initState));
        for (const action of gameQ.actions) {
            states = states.push(step(states.last(), action.data));
        }
        return states;
    }, [gameQ]);
    const clampFrame = (frame: number | null) => frame === null ? null : Math.min(states.size - 1, Math.max(0, frame));

    if (gameQ === undefined) {
        return <div>Loading...</div>
    }

    const game = frame === null ? states.last()! : states.get(frame)!;
    const canonicallyOrderedPlayers = game.players.sortBy(player => states.first()!.players.findIndex(p => p.name === player.name));

    const canAct = frame === null && game.players.first()!.name === viewer;

    const canGoBack = (frame === null) ? states.size > 1 : frame > 0;
    const canGoForward = frame !== null && frame < states.size - 1;
    console.log({ init: states.first() })

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
                <div>Hints: {game.nHints}</div>
                <div>Strikes: {game.nStrikes}</div>
                <div>Towers: {COLORS.map(c => [c, game.towers.get(c)]).filter(([_, r]) => r !== undefined).map(([c, r]) => `${c}: ${r}`).join(', ')}</div>
            </div>
            <table>
                <thead>
                    <tr>
                        {canonicallyOrderedPlayers.map(player => (<th key={player.name}>{player.name}</th>))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {canonicallyOrderedPlayers.map(player => {
                            const isViewer = player.name === viewer;
                            console.log({ isViewer, viewer, player: player.name })
                            return <td key={player.name}>
                                {handPosns.map(posn => {
                                    const card = player.hand.get(posn);
                                    return <div key={posn}>
                                        {card === undefined ? '_' : isViewer ? '?' : <button disabled={!canAct || game.nHints === 0} onClick={() => { act({ game: id, action: { type: "hintColor", targetName: player.name, color: card.color } }).catch(console.error) }}>{renderColor(card.color)}</button>}
                                        {card === undefined ? '_' : isViewer ? '?' : <button disabled={!canAct || game.nHints === 0} onClick={() => { act({ game: id, action: { type: "hintRank", targetName: player.name, rank: card.rank } }).catch(console.error) }}>{card.rank}</button>}
                                        {card === undefined ? '' : isViewer && <button disabled={!canAct} onClick={() => { act({ game: id, action: { type: "play", posn } }).catch(console.error) }}>Play</button>}
                                        {card === undefined ? '' : isViewer && <button disabled={!canAct} onClick={() => { act({ game: id, action: { type: "discard", posn } }).catch(console.error) }}>Discard</button>}
                                    </div>
                                })}
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
                    {states.zip(List(gameQ.actions)).map(([state, action], i) => (
                        <tr key={i}>
                            <td>
                                <button onClick={() => { setFrame(i) }}>{i + 1}</button>
                            </td>
                            <td>{state.players.first()?.name}</td>
                            <td>{JSON.stringify(action.data)}</td>
                        </tr>
                    )).reverse()}
                </tbody>
            </table>
        </div>
    )
}