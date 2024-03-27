import { useNavigate } from "react-router-dom";
import { getGameUrl } from "../routes";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { List } from "immutable";

function CreateGameForm() {
    const navigate = useNavigate();
    const createGame = useMutation(api.games.create);
    const [playersField, setPlayersField] = useState("");
    const [viewerField, setViewerField] = useState("");
    const [working, setWorking] = useState(false);

    return <form onSubmit={(e) => {
        e.preventDefault();
        if (working) return;
        const players = List(playersField.split(",").map(s => s.trim()));
        if (players.size < 2) throw new Error("Need at least 2 players");
        if (!players.contains(viewerField)) throw new Error("Viewer must be a player");
        setWorking(true);
        (async () => {
            const newGameId = await createGame({ players: playersField.split(",").map(s => s.trim()) });
            setWorking(false)
            setPlayersField("");
            navigate(getGameUrl(newGameId, viewerField));
        })().catch(console.error);
    }}>
        <input disabled={working} value={playersField} placeholder="Alice, Bob, Charlie" onChange={(e) => { setPlayersField(e.target.value) }} />
        <input disabled={working} value={viewerField} placeholder="Your name" onChange={(e) => { setViewerField(e.target.value) }} />
        <button disabled={working} type="submit">Create</button>
    </form>

}

export function Page() {
    return <CreateGameForm />
}