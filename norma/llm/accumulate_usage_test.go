package llm

import "testing"

// 两种 usage 帧形态都必须折叠出正确的总量，且 input 侧只计一次：
//
//   - 官方 Anthropic：message_start 带真实 input 侧，message_delta 回显并带
//     增量 output。回显不得重复计数。
//   - 智谱 BigModel 等兼容端点：message_start 的 usage 全零占位，真实总量
//     （含 cache_read/cache_creation）只在最终 message_delta 出现。
func TestAccumulatorUsageOfficialAnthropicShape(t *testing.T) {
	a := NewAccumulator()
	a.Add(StreamEvent{Type: SEMessageStart, Usage: Usage{InputTokens: 1000, CacheReadTokens: 800}})
	a.Add(StreamEvent{Type: SETextDelta, Text: "hi"})
	a.Add(StreamEvent{Type: SEMessageDelta, StopReason: "end_turn",
		Usage: Usage{InputTokens: 1000, CacheReadTokens: 800, OutputTokens: 50}})
	a.Add(StreamEvent{Type: SEMessageStop})

	u := a.Usage
	if u.InputTokens != 1000 || u.CacheReadTokens != 800 || u.OutputTokens != 50 {
		t.Fatalf("official shape: got %+v, want input=1000 cache_read=800 output=50 (delta 回显不得重复计数)", u)
	}
}

func TestAccumulatorUsageZhipuZeroStartShape(t *testing.T) {
	a := NewAccumulator()
	a.Add(StreamEvent{Type: SEMessageStart, Usage: Usage{}}) // 零占位
	a.Add(StreamEvent{Type: SETextDelta, Text: "hi"})
	a.Add(StreamEvent{Type: SEMessageDelta, StopReason: "end_turn",
		Usage: Usage{InputTokens: 1428, CacheReadTokens: 1408, OutputTokens: 24}})
	a.Add(StreamEvent{Type: SEMessageStop})

	u := a.Usage
	if u.InputTokens != 1428 || u.CacheReadTokens != 1408 || u.OutputTokens != 24 {
		t.Fatalf("zhipu shape: got %+v, want input=1428 cache_read=1408 output=24 (零占位 start 后 delta 总量应被采纳)", u)
	}
}

// OpenAI 形态：没有带 usage 的 message_start，usage 只在最终事件出现一次。
func TestAccumulatorUsageOpenAIShape(t *testing.T) {
	a := NewAccumulator()
	a.Add(StreamEvent{Type: SEMessageDelta, StopReason: "stop",
		Usage: Usage{InputTokens: 30, OutputTokens: 7}})
	u := a.Usage
	if u.InputTokens != 30 || u.OutputTokens != 7 {
		t.Fatalf("openai shape: got %+v, want input=30 output=7", u)
	}
}
