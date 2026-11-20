






let menuEl = null;
let previouslyFocused = null;

function onOutsideClick(e){
  if(menuEl && !menuEl.contains(e.target)) closeMenu();
}
function focusableItems(){
  return Array.from(menuEl.querySelectorAll('.context-menu-item:not([disabled])'));
}





function onKeydown(e){
  if(!menuEl) return;
  if(e.key === 'Escape'){ closeMenu(); return; }
  const items = focusableItems();
  if(!items.length) return;
  const idx = items.indexOf(document.activeElement);
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    items[(idx+1+items.length) % items.length].focus();
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    items[(idx-1+items.length) % items.length].focus();
  } else if(e.key === 'Home'){
    e.preventDefault();
    items[0].focus();
  } else if(e.key === 'End'){
    e.preventDefault();
    items[items.length-1].focus();
  }
}
function onFocusOut(e){



  if(menuEl && e.relatedTarget && !menuEl.contains(e.relatedTarget)) closeMenu();
}

export function closeMenu(){
  if(menuEl){
    menuEl.remove();
    menuEl = null;
    if(previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
  }
  window.removeEventListener('pointerdown', onOutsideClick, true);
  window.removeEventListener('keydown', onKeydown);
}

export function showMenu(x, y, items){
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  closeMenu();
  previouslyFocused = opener;
  menuEl = document.createElement('div');
  menuEl.className = 'context-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.style.left = x + 'px';
  menuEl.style.top = y + 'px';
  menuEl.addEventListener('focusout', onFocusOut);
  items.forEach(item=>{
    if(item.separator){
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      sep.setAttribute('role', 'separator');
      menuEl.appendChild(sep);
      return;
    }
    const row = document.createElement('button');
    row.className = 'context-menu-item';
    row.type = 'button';
    row.setAttribute('role', 'menuitem');
    row.textContent = item.label;
    if(item.disabled){
      row.disabled = true;
      row.setAttribute('aria-disabled', 'true');
    } else {
      row.addEventListener('click', ()=>{ closeMenu(); item.action(); });
    }
    menuEl.appendChild(row);
  });
  document.body.appendChild(menuEl);


  const rect = menuEl.getBoundingClientRect();
  if(rect.right > window.innerWidth) menuEl.style.left = Math.max(0, window.innerWidth - rect.width - 4) + 'px';
  if(rect.bottom > window.innerHeight) menuEl.style.top = Math.max(0, window.innerHeight - rect.height - 4) + 'px';




  setTimeout(()=>{
    window.addEventListener('pointerdown', onOutsideClick, true);
    window.addEventListener('keydown', onKeydown);
    const first = focusableItems()[0];
    if(first) first.focus();
  }, 0);
}
