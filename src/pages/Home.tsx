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
    const [working, setWorking] = useState(false);

    const players = List(playersField.split(",").map(s => s.trim())).filter(s => s.length > 0);
    const canSubmit = !working && players.size >= 2 && players.size <= 5;

    return <form onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setWorking(true);
        (async () => {
            const newGameId = await createGame({ players: players.toArray() });
            setWorking(false)
            setPlayersField("");
            navigate(getGameUrl(newGameId));
        })().catch(console.error);
    }}>
        Players: <input disabled={working} value={playersField} placeholder="Alice, Bob, Charlie" onChange={(e) => { setPlayersField(e.target.value) }} />
        <button disabled={!canSubmit} type="submit">Create</button>
    </form>

}

export function Page() {
    return <CreateGameForm />
}