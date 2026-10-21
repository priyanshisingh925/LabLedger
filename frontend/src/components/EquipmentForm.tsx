import { useState, type FormEvent } from "react";
import { parseEther } from "ethers";
import { PlusCircle } from "lucide-react";
import { useActions } from "../hooks/useActions";
import { useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { Notice } from "./ui";

/** Administrator form that registers a new piece of equipment on-chain. */
export function EquipmentForm({ disabled }: { disabled?: boolean }) {
  const { snapshot } = useLedger();
  const actions = useActions();
  const { busy } = useTx();
  const nextId = snapshot && snapshot.equipment.length
    ? (snapshot.equipment.reduce((m, e) => (e.id > m ? e.id : m), 0n) + 1n).toString()
    : "1";

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [deposit, setDeposit] = useState("");
  const [formError, setFormError] = useState<string>();

  const categories = Array.from(new Set((snapshot?.equipment ?? []).map((e) => e.category)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const idStr = id.trim() || nextId;
    if (!/^\d+$/.test(idStr) || BigInt(idStr) === 0n) return setFormError("Equipment ID must be a positive whole number.");
    if (!name.trim()) return setFormError("Name is required.");
    let wei: bigint;
    try {
      wei = parseEther(deposit.trim() || "0");
    } catch {
      return setFormError("Deposit must be a number of ETH, e.g. 0.05");
    }
    if (wei <= 0n) return setFormError("Deposit must be greater than zero.");

    const ok = await actions.registerEquipment(BigInt(idStr), name.trim(), category.trim(), description.trim(), wei);
    if (ok) {
      setId("");
      setName("");
      setCategory("");
      setDescription("");
      setDeposit("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {disabled && <Notice tone="warn">Connect the administrator wallet to register equipment.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="eq-id">Equipment ID</label>
          <input id="eq-id" className="input font-mono" inputMode="numeric" placeholder={`next: #${nextId}`} value={id} onChange={(e) => setId(e.target.value)} disabled={disabled} />
        </div>
        <div className="lg:col-span-2">
          <label className="label" htmlFor="eq-name">Name</label>
          <input id="eq-name" className="input" placeholder="e.g. Oscilloscope DS1054Z" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="eq-cat">Category</label>
          <input id="eq-cat" className="input" list="eq-categories" placeholder="Instruments" value={category} onChange={(e) => setCategory(e.target.value)} disabled={disabled} />
          <datalist id="eq-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="eq-desc">Description</label>
          <input id="eq-desc" className="input" placeholder="100 MHz 4-channel digital storage oscilloscope" value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="eq-dep">Deposit (ETH)</label>
          <input id="eq-dep" className="input font-mono" inputMode="decimal" placeholder="0.05" value={deposit} onChange={(e) => setDeposit(e.target.value)} disabled={disabled} />
        </div>
      </div>
      {formError && <Notice tone="error">{formError}</Notice>}
      <button className="btn-primary" type="submit" disabled={disabled || busy}>
        <PlusCircle className="h-4 w-4" />
        <span>Register on Blockchain</span>
      </button>
    </form>
  );
}

