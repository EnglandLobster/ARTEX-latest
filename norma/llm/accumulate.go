package llm

import (
	"encoding/json"
	"strings"
)

// Accumulator reassembles a complete assistant Message from a stream of
// normalized StreamEvents. The harness feeds every event to Add; once the
// stream ends, Message returns the finished assistant turn (text, thinking, and
// tool_use blocks in arrival order).
type Accumulator struct {
	blocks     []ContentBlock
	toolInputs []*strings.Builder
	textBuf    *strings.Builder
	thinkBuf   *strings.Builder
	thinkSig   string // signature for the current thinking block
	StopReason string
	Usage      Usage
	// inputTaken records that the input-side usage (input/cache tokens) has been
	// counted once. Official Anthropic reports it at message_start and re-echoes
	// it on message_delta; Anthropic-compatible endpoints that zero-fill
	// message_start (e.g. Zhipu BigModel) report it only on the final
	// message_delta. First-nonzero-wins keeps both shapes from double counting.
	inputTaken bool
}

// NewAccumulator returns an empty Accumulator.
func NewAccumulator() *Accumulator { return &Accumulator{} }

// inputSideNonZero reports whether u carries any input-side tokens.
func inputSideNonZero(u Usage) bool {
	return u.InputTokens != 0 || u.CacheReadTokens != 0 || u.CacheWriteTokens != 0
}

// Add folds one event into the accumulator.
func (a *Accumulator) Add(ev StreamEvent) {
	switch ev.Type {
	case SEMessageStart:
		a.Usage.Add(ev.Usage)
		if inputSideNonZero(ev.Usage) {
			a.inputTaken = true
		}
	case SETextDelta:
		if a.textBuf == nil {
			a.flushThinking()
			a.textBuf = &strings.Builder{}
		}
		a.textBuf.WriteString(ev.Text)
	case SEThinkingDelta:
		if a.thinkBuf == nil {
			a.flushText()
			a.thinkBuf = &strings.Builder{}
		}
		a.thinkBuf.WriteString(ev.Text)
	case SEThinkingSignature:
		a.thinkSig = ev.Text
	case SEToolUseStart:
		a.flushText()
		a.flushThinking()
		a.blocks = append(a.blocks, ContentBlock{Type: BlockToolUse, ID: ev.ToolID, Name: ev.ToolName})
		a.toolInputs = append(a.toolInputs, &strings.Builder{})
	case SEToolInputJSON:
		if n := len(a.toolInputs); n > 0 {
			a.toolInputs[n-1].WriteString(ev.Text)
		}
	case SEMessageDelta:
		if ev.StopReason != "" {
			a.StopReason = ev.StopReason
		}
		// Input side: adopt it only when it was never counted (zero-filled
		// message_start). Output side always counts.
		if !a.inputTaken && inputSideNonZero(ev.Usage) {
			a.inputTaken = true
			in := ev.Usage
			in.OutputTokens = 0
			a.Usage.Add(in)
		}
		a.Usage.Add(Usage{OutputTokens: ev.Usage.OutputTokens})
	case SEMessageStop:
		a.flushText()
		a.flushThinking()
	}
}

func (a *Accumulator) flushText() {
	if a.textBuf != nil {
		if s := a.textBuf.String(); s != "" {
			a.blocks = append(a.blocks, TextBlock(s))
		}
		a.textBuf = nil
	}
}

func (a *Accumulator) flushThinking() {
	if a.thinkBuf != nil {
		if s := a.thinkBuf.String(); s != "" {
			a.blocks = append(a.blocks, ContentBlock{
				Type:      BlockThinking,
				Thinking:  s,
				Signature: a.thinkSig,
			})
		}
		a.thinkBuf = nil
		a.thinkSig = ""
	}
}

// Message finalizes and returns the assembled assistant message. Partial tool
// inputs are validated; malformed JSON falls back to "{}".
func (a *Accumulator) Message() Message {
	a.flushText()
	a.flushThinking()
	ti := 0
	out := make([]ContentBlock, len(a.blocks))
	for i, b := range a.blocks {
		if b.Type == BlockToolUse {
			raw := strings.TrimSpace(a.toolInputs[ti].String())
			ti++
			if raw == "" || !json.Valid([]byte(raw)) {
				raw = "{}"
			}
			b.Input = json.RawMessage(raw)
		}
		out[i] = b
	}
	return Message{Role: RoleAssistant, Content: out}
}
