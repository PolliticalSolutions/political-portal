begin;

update parties
set colour_hex = '#E4003B'
where lower(name) in (
  'labour',
  'labour co-operative',
  'labour and co-operative party',
  'labour and co-operative'
);

update parties
set colour_hex = '#0087DC'
where lower(name) = 'conservative';

update parties
set colour_hex = '#FAA61A'
where lower(name) in ('liberal democrat', 'liberal democrats');

update parties
set colour_hex = '#12B6CF'
where lower(name) = 'reform uk';

update parties
set colour_hex = '#FDF38E'
where lower(name) in ('snp', 'scottish national party');

update parties
set colour_hex = '#00B140'
where lower(name) = 'green';

update parties
set colour_hex = '#005B54'
where lower(name) = 'plaid cymru';

update parties
set colour_hex = '#D46A4C'
where lower(name) in ('dup', 'democratic unionist party');

update parties
set colour_hex = '#326760'
where lower(name) in ('sinn féin', 'sinn fein');

update parties
set colour_hex = '#006B54'
where lower(name) in ('sdlp', 'social democratic and labour party');

update parties
set colour_hex = '#F6CB2F'
where lower(name) in ('alliance', 'alliance party', 'alliance party of northern ireland');

update parties
set colour_hex = '#48A5EE'
where lower(name) in ('uup', 'ulster unionist party');

commit;
