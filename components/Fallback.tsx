import { COUPLE, DIRECTIONS_URL, EVENT, MESSAGE, VENUE } from "@/lib/content";

/**
 * No WebGL: six stacked cards with the identical content and a real anchor for
 * directions. Never an error message.
 */
export default function Fallback() {
  return (
    <div className="fallback" id="fallback">
      <div className="wrap">
        <div className="card">
          <hr />
          <div className="nm">{COUPLE.him.name.toUpperCase()}</div>
          <p className="sub">
            <em>&amp;</em>
          </p>
          <div className="nm">{COUPLE.her.name.toUpperCase()}</div>
          <hr />
          <h2 style={{ margin: "16px 0 10px" }}>{EVENT.kind}</h2>
          <p className="sub">Swipe to explore</p>
          <p className="sub" style={{ marginTop: 14, letterSpacing: "0.24em" }}>
            {EVENT.dateLine}
          </p>
        </div>

        <div className="card">
          <h2>THE COUPLE</h2>
          <div className="nm">{COUPLE.him.name}</div>
          <p className="sub">{COUPLE.him.parents}</p>
          <hr />
          <div className="nm">{COUPLE.her.name}</div>
          <p className="sub">{COUPLE.her.parents}</p>
        </div>

        <div className="card">
          <h2>SAVE THE DATE</h2>
          <div className="big">{EVENT.day}</div>
          <div className="nm" style={{ fontSize: 20 }}>
            {EVENT.month}
          </div>
          <p className="sub" style={{ letterSpacing: "0.24em" }}>
            {EVENT.year}
          </p>
          <hr />
          <div className="nm" style={{ fontSize: 17 }}>
            {EVENT.weekday}
          </div>
          <p>{EVENT.time}</p>
        </div>

        <div className="card">
          <h2>
            WITH THE BLESSINGS
            <br />
            OF OUR FAMILIES
          </h2>
          <div className="nm">{COUPLE.him.name}</div>
          <p className="sub">{COUPLE.him.parents}</p>
          <hr />
          <p className="sub">
            <em>and</em>
          </p>
          <hr />
          <div className="nm">{COUPLE.her.name}</div>
          <p className="sub">{COUPLE.her.parents}</p>
        </div>

        <div className="card">
          <h2>THE VENUE</h2>
          <div className="nm" style={{ fontSize: 22 }}>
            {VENUE.name}
          </div>
          <p className="sub" style={{ letterSpacing: "0.3em" }}>
            {VENUE.qualifier}
          </p>
          <hr />
          <p>
            {VENUE.address[0]}
            <br />
            {VENUE.address[1]}
            <br />
            {VENUE.address[2]}
          </p>
          <a className="pill" id="fbdir" href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
            {VENUE.cta}
          </a>
        </div>

        <div className="card">
          <h2>{MESSAGE.heading}</h2>
          <p>
            <em>
              {MESSAGE.lines[0]}
              <br />
              {MESSAGE.lines[1]}
            </em>
          </p>
          <hr />
          <div className="nm" style={{ fontSize: 22 }}>
            {MESSAGE.signature}
          </div>
          <p className="sub" style={{ marginTop: 10, letterSpacing: "0.24em" }}>
            {EVENT.dateLine}
          </p>
        </div>
      </div>
    </div>
  );
}
