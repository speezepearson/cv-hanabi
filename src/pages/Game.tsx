import { useQuery } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useNavigate } from "react-router-dom";
import { getPlayUrl } from "../routes";

export interface Props {
    id: Id<'games'>;
}

export function Page({ id }: Props) {
    const gameQ = useQuery(api.games.get, { id });
    const navigate = useNavigate();

    if (!gameQ) {
        return <div>Loading...</div>;
    }

    return <div>
        You are:
        {gameQ.init.initState.players.sort().map(p => <button key={p.name} onClick={() => { navigate(getPlayUrl(id, p.name)) }}>{p.name}</button>)}
    </div>
}