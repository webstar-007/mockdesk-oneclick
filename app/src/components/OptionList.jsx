import Rich from './Rich.jsx';
import { Figure } from './QuestionView.jsx';
import { LETTERS } from '../lib/format.js';
/** mode "exam": selectable.  mode "review": shows correct / chosen state. */
export default function OptionList({ options, figures, images, selected, onSelect, correct, mode = 'exam', name }) {
  return (
    <div className={`options${figures ? ' options-fig' : ''}`} role={mode === 'exam' ? 'radiogroup' : 'list'} aria-label="Answer options">
      {options.map((o, i) => {
        const cls = ['opt'];
        if (mode === 'exam' && selected === i) cls.push('sel');
        if (mode === 'review') { if (i === correct) cls.push('ok'); if (i === selected && i !== correct) cls.push('bad'); }
        const inner = (<><span className="opt-key">{LETTERS[i]}</span><span className="opt-text">{figures?.[i] ? <Figure svg={figures[i]} label={`Option ${LETTERS[i]}`} className="fig fig-opt" /> : <>{images?.[i] && <img className="opt-img" src={images[i]} alt={`Option ${LETTERS[i]}`} loading="lazy" />}{o ? <Rich text={o} /> : null}</>}</span>
          {mode === 'review' && i === correct && <span className="opt-tag good">Correct answer</span>}
          {mode === 'review' && i === selected && i !== correct && <span className="opt-tag wrong">Your answer</span>}
          {mode === 'review' && i === selected && i === correct && <span className="opt-tag good">Your answer</span>}</>);
        return mode === 'exam'
          ? (<button type="button" key={i} role="radio" aria-checked={selected === i} className={cls.join(' ')} onClick={() => onSelect(i)} name={name}>{inner}</button>)
          : (<div key={i} role="listitem" className={cls.join(' ')}>{inner}</div>);
      })}
    </div>
  );
}
