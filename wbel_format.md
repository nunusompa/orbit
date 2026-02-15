# Whiteboard Event Log (`.wbel`) Specification

The **Whiteboard Event Log (`.wbel`)** is a lightweight, human-readable text format designed to record and reconstruct drawing actions on a digital whiteboard. Instead of saving a static image (like a PNG or JPEG), it utilizes an **event-sourcing model**. Every stroke, erasure, and undo action is preserved in chronological order, allowing the exact sequence of actions to be replayed, modified, or reversed.

---

## File Structure

A `.wbel` file is a plain-text file. It follows a simple comma-separated values (CSV) structure with the following general rules:

* Each line represents a single distinct event.
* Events are recorded and read in strict chronological order.
* Fields within an event are separated by commas (`,`).
* Empty lines are ignored during import.

---

## Event Types

There are three primary event types in the `.wbel` specification: **Draw (`D`)**, **Erase (`E`)**, and **Undo (`U`)**.

### 1. Draw Event (`D`)

Records a single, continuous stroke made on the canvas. It includes bounding box (BBox) coordinates to optimize performance during erasure hit-testing.

**Format:**
`D,{timestamp},{id},{color},{width},{minX},{minY},{maxX},{maxY},{pathString}`

| Index | Field | Description | Example |
| --- | --- | --- | --- |
| 0 | `type` | The event type identifier. Always `D`. | `D` |
| 1 | `timestamp` | ISO 8601 formatted date string. | `2026-02-15T13:50:31.000Z` |
| 2 | `id` | Unique string identifier for the stroke. | `s:lqxyz123abc` |
| 3 | `color` | The stroke color (hex, rgb, or color name). | `#ff0000` |
| 4 | `width` | The brush size/line width (float). | `5.5` |
| 5 | `minX` | BBox Left boundary (rounded integer). | `120` |
| 6 | `minY` | BBox Top boundary (rounded integer). | `85` |
| 7 | `maxX` | BBox Right boundary (rounded integer). | `340` |
| 8 | `maxY` | BBox Bottom boundary (rounded integer). | `210` |
| 9+ | `pathString` | SVG-compatible Bezier path string. | `M 120 85 Q 150 100 200 150 L 340 210` |

### 2. Erase Event (`E`)

Records the deletion of one or more existing strokes. Rather than deleting the data, this event appends a log indicating which stroke IDs should no longer be rendered.

**Format:**
`E,{timestamp},{ids}`

| Index | Field | Description | Example |
| --- | --- | --- | --- |
| 0 | `type` | The event type identifier. Always `E`. | `E` |
| 1 | `timestamp` | ISO 8601 formatted date string. | `2026-02-15T13:51:10.000Z` |
| 2 | `ids` | Semicolon-separated list of erased stroke IDs. | `s:id1;s:id2;s:id3` |

### 3. Undo Event (`U`)

Reverts the most recent action (either a Draw or an Erase). During state computation, an Undo event pops the last action off the action stack and updates the active strokes accordingly.

**Format:**
`U,{timestamp}`

| Index | Field | Description | Example |
| --- | --- | --- | --- |
| 0 | `type` | The event type identifier. Always `U`. | `U` |
| 1 | `timestamp` | ISO 8601 formatted date string. | `2026-02-15T13:51:45.000Z` |

---

## Example `.wbel` File

```wbel
D,2026-02-15T13:50:00.000Z,s:1a2b3c,#000000,5,10,10,100,100,M 10 10 Q 50 50 100 100 L 100 100
D,2026-02-15T13:50:05.000Z,s:4d5e6f,#ff0000,10,200,200,300,300,M 200 200 Q 250 250 300 300 L 300 300
E,2026-02-15T13:50:15.000Z,s:1a2b3c
U,2026-02-15T13:50:20.000Z
E,2026-02-15T13:50:25.000Z,s:1a2b3c;s:4d5e6f
```

### Breakdown of the example:

1. **Line 1:** Draws a black line. ID: `s:1a2b3c`.
2. **Line 2:** Draws a thick red line. ID: `s:4d5e6f`.
3. **Line 3:** Erases the black line (`s:1a2b3c`).
4. **Line 4:** Undoes the last action (restores the black line).
5. **Line 5:** A rectangle erase action deletes both the black and red lines simultaneously.
